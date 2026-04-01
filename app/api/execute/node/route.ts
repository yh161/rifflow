import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TEXT_MODEL_DEFS, TEXT_MODEL_MAP, IMAGE_MODEL_MAP, DEFAULT_IMAGE_MODEL_DEF } from "@/app/services/constants"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import { runReplicate, urlToBase64, extractUrl } from "@/app/services/replicate"
import type { MultimodalContent } from "@/lib/prompt-resolver"

const CREDIT_COST: Record<string, number> = { text: 1, gate: 1, image: 1 }

const baseHeaders = () => ({
  "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
  "Content-Type":  "application/json",
  "HTTP-Referer":  process.env.NEXTAUTH_URL ?? "http://localhost:3000",
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { nodeType, prompt, content, model, params: modelParams } = await req.json()

    const hasContent = content && Array.isArray(content) && content.length > 0
    const hasPrompt  = prompt && (typeof prompt === "string" ? prompt.trim().length > 0 : true)
    if (!hasContent && !hasPrompt) {
      return NextResponse.json({ error: "Prompt or content is required" }, { status: 400 })
    }

    let normalizedContent: MultimodalContent[]
    if (hasContent) {
      normalizedContent = content as MultimodalContent[]
    } else if (typeof prompt === "string") {
      normalizedContent = [{ type: "text", text: prompt }]
    } else {
      normalizedContent = prompt as MultimodalContent[]
    }

    const cost = CREDIT_COST[nodeType] ?? 1
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { wallet: true },
    })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (!user.wallet || user.wallet.points < cost) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
    }

    if (nodeType === "image") return handleImage({ user, content: normalizedContent, model, cost })
    return handleText({ user, nodeType, content: normalizedContent, model, cost, modelParams })

  } catch (err: unknown) {
    console.error("[execute/node] unhandled:", err)
    return NextResponse.json({ error: (err as Error)?.message ?? "Internal server error" }, { status: 500 })
  }
}

// ── Text ──────────────────────────────────────────────────────────────────────
async function handleText({
  user, nodeType, content, model, cost, modelParams,
}: { user: { id: string }; nodeType: string; content: MultimodalContent[]; model: string; cost: number; modelParams?: Record<string, string> }) {
  // Resolve model definition — route to Replicate or OpenRouter
  const modelDef = TEXT_MODEL_DEFS[model] ?? TEXT_MODEL_DEFS[DEFAULT_TEXT_MODEL_ID]

  let resultContent: string

  const temperature = modelParams?.temperature ? parseFloat(modelParams.temperature) : 0.7

  if (modelDef?.backend === "replicate") {

    if (modelDef.supportsImageInput) {
      // ── Multimodal Replicate: prompt (string) + model-specific image field ──
      // Verified schemas via Replicate API:
      //   Gemini 2.5 Flash / 3.1 Pro → images: URI[]
      //   Claude Opus 4.6            → image: URI   (single string, not array)
      //   GPT-5.2                    → image_input: URI[]

      // 1. Concatenate text blocks → prompt string
      const promptText = content
        .filter(c => c.type === "text")
        .map(c => (c as { type: string; text: string }).text)
        .join("\n")
        .trim()

      // 2. Convert image URLs to base64 data URIs (localhost/MinIO not accessible from Replicate)
      const imageDataUris: string[] = await Promise.all(
        content
          .filter(c => c.type === "image_url")
          .map(c => (c as { type: string; image_url: { url: string } }).image_url.url)
          .map(async url => {
            if (url.startsWith("data:")) return url
            try {
              const { b64, mime } = await urlToBase64(url)
              return `data:${mime};base64,${b64}`
            } catch {
              return url
            }
          })
      )

      // 3. Build input — prompt is required by all models
      const tokenParam = modelDef.tokenParam ?? "max_output_tokens"
      const replicateInput: Record<string, unknown> = {
        prompt:      promptText || "Describe the content of the provided image(s).",
        [tokenParam]: 8192,
      }

      // 4. Attach images using model-specific field name
      if (imageDataUris.length > 0 && modelDef.imageParam) {
        replicateInput[modelDef.imageParam] = modelDef.imageSingle
          ? imageDataUris[0]   // Claude: single string
          : imageDataUris      // Gemini / GPT: array
      }

      if (!modelDef.noTemperature) replicateInput.temperature = temperature
      if (modelParams && modelDef.extraParamKeys) {
        for (const key of modelDef.extraParamKeys) {
          if (modelParams[key] !== undefined) {
            const v = modelParams[key]
            replicateInput[key] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
          }
        }
      }

      const output = await runReplicate(modelDef.modelPath, replicateInput)
      resultContent = Array.isArray(output)
        ? (output as string[]).join("")
        : String(output ?? "")

    } else {
      // ── Text-only Replicate model: plain prompt string ───────────────────
      const promptText = content
        .filter(c => c.type === "text")
        .map(c => (c as { type: string; text: string }).text)
        .join("\n")

      const tokenParam = modelDef.tokenParam ?? "max_new_tokens"
      const replicateInput: Record<string, unknown> = { prompt: promptText, [tokenParam]: 8192 }
      if (!modelDef.noTemperature) replicateInput.temperature = temperature
      if (modelParams && modelDef.extraParamKeys) {
        for (const key of modelDef.extraParamKeys) {
          if (modelParams[key] !== undefined) {
            const v = modelParams[key]
            replicateInput[key] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
          }
        }
      }
      const output = await runReplicate(modelDef.modelPath, replicateInput)
      resultContent = Array.isArray(output)
        ? (output as string[]).join("")
        : String(output ?? "")
    }

  } else {
    // ── OpenRouter path ───────────────────────────────────────────────────
    const orModel = TEXT_MODEL_MAP[model] ?? TEXT_MODEL_MAP[DEFAULT_TEXT_MODEL_ID] ?? "deepseek/deepseek-chat"

    // Strip image blocks for non-multimodal OpenRouter models to prevent API errors
    const apiContent: MultimodalContent[] = modelDef?.supportsImageInput
      ? content
      : content.filter(c => c.type === "text")

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ model: orModel, messages: [{ role: "user", content: apiContent.length > 0 ? apiContent : content }] }),
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      console.error("[text] error:", aiRes.status, err)
      return NextResponse.json({ error: `Text model error (${aiRes.status})` }, { status: 500 })
    }

    const aiJson = await aiRes.json()
    resultContent = aiJson.choices?.[0]?.message?.content ?? ""
  }

  await prisma.$transaction([
    prisma.wallet.update({ where: { userId: user.id }, data: { points: { decrement: cost } } }),
    prisma.executionLog.create({
      data: { userId: user.id, nodeType: nodeType ?? "text", inputTokens: 0, outputTokens: 0, creditCost: cost, status: "SUCCESS" },
    }),
  ])

  return NextResponse.json({ content: resultContent })
}

// ── Image (Replicate) ─────────────────────────────────────────────────────────
async function handleImage({
  user, content, model, cost,
}: { user: { id: string }; content: MultimodalContent[]; model: string; cost: number }) {
  const modelDef   = IMAGE_MODEL_MAP[model] ?? DEFAULT_IMAGE_MODEL_DEF
  const promptText = content.find(c => c.type === "text")?.text ?? ""

  console.log("[image] backend:", modelDef.backend, "| model:", modelDef.modelPath, "| prompt:", promptText.slice(0, 80))

  try {
    let b64: string
    let mime: string

    if (modelDef.backend === "replicate") {
      // nano-banana / nano-banana-pro schema (verified 2026-03):
      //   prompt[REQ](string), image_input(URI[], optional), aspect_ratio, output_format, …
      //   OUTPUT: string URI  (extractUrl handles both string and string[])
      const replicateInput: Record<string, unknown> = { prompt: promptText }

      // Pass upstream image(s) as base64 data URIs so Replicate can access
      // them even when running on localhost (MinIO not publicly reachable)
      const imageDataUris: string[] = await Promise.all(
        content
          .filter(c => c.type === "image_url")
          .map(c => (c as { type: string; image_url: { url: string } }).image_url.url)
          .map(async url => {
            if (url.startsWith("data:")) return url
            try {
              const { b64: ib64, mime: im } = await urlToBase64(url)
              return `data:${im};base64,${ib64}`
            } catch {
              return url
            }
          })
      )
      if (imageDataUris.length > 0) replicateInput.image_input = imageDataUris

      const output   = await runReplicate(modelDef.modelPath, replicateInput)
      const imageUrl = extractUrl(output)
      ;({ b64, mime } = await urlToBase64(imageUrl))
    } else {
      // OpenRouter fallback
      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:  "POST",
        headers: baseHeaders(),
        body: JSON.stringify({
          model:      modelDef.modelPath,
          modalities: modelDef.modalities,
          messages:   [
            { role: "system", content: "You are an image generation assistant. Generate an image directly. Never ask for clarification." },
            { role: "user", content },
          ],
        }),
      })
      const rawText = await aiRes.text()
      if (!aiRes.ok) return NextResponse.json({ error: `OpenRouter error (${aiRes.status}): ${rawText.slice(0, 300)}` }, { status: 500 })

      const aiJson  = JSON.parse(rawText)
      const message = aiJson.choices?.[0]?.message
      let dataUrl: string | undefined
      if (Array.isArray(message?.images) && message.images.length > 0) {
        dataUrl = message.images[0]?.image_url?.url ?? message.images[0]?.imageUrl?.url
      }
      if (!dataUrl) {
        const blocks    = Array.isArray(message?.content) ? message.content : []
        const imageBlock = blocks.find((b: { type?: string; image_url?: { url?: string } }) => b.type === "image_url")
        dataUrl         = imageBlock?.image_url?.url
      }
      if (!dataUrl) return NextResponse.json({ error: "Model returned text instead of an image — try a more descriptive prompt." }, { status: 500 })

      const commaIdx = dataUrl.indexOf(",")
      b64  = dataUrl.slice(commaIdx + 1)
      mime = dataUrl.slice(0, commaIdx).replace("data:", "").replace(";base64", "") || "image/png"
    }

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: user.id }, data: { points: { decrement: cost } } }),
      prisma.executionLog.create({
        data: { userId: user.id, nodeType: "image", inputTokens: 0, outputTokens: 0, creditCost: cost, status: "SUCCESS" },
      }),
    ])

    console.log("[image] success | mime:", mime, "| b64 len:", b64.length)
    return NextResponse.json({ b64, mime })

  } catch (err: unknown) {
    console.error("[image] error:", err)
    return NextResponse.json({ error: (err as Error)?.message ?? "Image generation failed" }, { status: 500 })
  }
}
