import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { MultimodalContent } from "@/lib/prompt-resolver"

const CREDIT_COST: Record<string, number> = { text: 1, gate: 1, image: 1 }

const TEXT_MODEL_MAP: Record<string, string> = {
  "gemini-2.0-flash":  "google/gemini-2.0-flash-001",
  "gemini-1.5-pro":    "google/gemini-pro-1.5",
  "gpt-4o":            "openai/gpt-4o",
  "claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
}

// Each image model needs its own modality list:
//   Gemini (text+image model) → ["image", "text"]
//   Flux   (image-only model) → ["image"]
interface ImageModelDef {
  id:         string
  modalities: string[]
}
const IMAGE_MODEL_MAP: Record<string, ImageModelDef> = {
  "seedream-4.5": {
    id:         "bytedance-seed/seedream-4.5",
    modalities: ["image"],   // image-only model, no text output
  },
}

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

    const { nodeType, prompt, content, model } = await req.json()
    
    // Support both legacy string prompt and new multimodal content format
    const hasContent = content && Array.isArray(content) && content.length > 0
    const hasPrompt = prompt && (typeof prompt === "string" ? prompt.trim().length > 0 : true)
    
    if (!hasContent && !hasPrompt) {
      return NextResponse.json({ error: "Prompt or content is required" }, { status: 400 })
    }

    // Normalize content to MultimodalContent[] format
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
    return handleText({ user, nodeType, content: normalizedContent, model, cost })

  } catch (err: any) {
    console.error("[execute/node] unhandled:", err)
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 })
  }
}

// ─────────────────────────────────────────────
// Text / Gate
// ─────────────────────────────────────────────
async function handleText({
  user, nodeType, content, model, cost,
}: { user: any; nodeType: string; content: MultimodalContent[]; model: string; cost: number }) {
  const orModel = TEXT_MODEL_MAP[model] ?? "google/gemini-2.0-flash-001"

  const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({ model: orModel, messages: [{ role: "user", content }] }),
  })

  if (!aiRes.ok) {
    const err = await aiRes.text()
    console.error("[text] error:", aiRes.status, err)
    return NextResponse.json({ error: `Text model error (${aiRes.status})` }, { status: 500 })
  }

  const aiJson = await aiRes.json()
  const resultContent = aiJson.choices?.[0]?.message?.content ?? ""
  const inputTokens  = aiJson.usage?.prompt_tokens     ?? 0
  const outputTokens = aiJson.usage?.completion_tokens ?? 0

  await prisma.$transaction([
    prisma.wallet.update({ where: { userId: user.id }, data: { points: { decrement: cost } } }),
    prisma.executionLog.create({
      data: { userId: user.id, nodeType: nodeType ?? "text", inputTokens, outputTokens, creditCost: cost, status: "SUCCESS" },
    }),
  ])

  return NextResponse.json({ content: resultContent })
}

// ─────────────────────────────────────────────
// Image — /v1/chat/completions + modalities
//
// Response content is an array of blocks. Image block shape:
//   { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
// ─────────────────────────────────────────────
async function handleImage({
  user, content, model, cost,
}: { user: any; content: MultimodalContent[]; model: string; cost: number }) {
  const modelDef = IMAGE_MODEL_MAP[model] ?? IMAGE_MODEL_MAP["seedream-4.5"]

  // Log first text content for debugging
  const firstText = content.find(c => c.type === "text")?.text ?? ""
  console.log("[image] model:", modelDef.id, "| modalities:", modelDef.modalities, "| prompt:", firstText.slice(0, 80))

  const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:  "POST",
    headers: baseHeaders(),
    body: JSON.stringify({
      model:      modelDef.id,
      modalities: modelDef.modalities,
      messages:   [
        {
          role:    "system",
          content: "You are an image generation assistant. Always generate an image directly based on the user's description. Never ask for clarification — interpret the prompt creatively and produce an image immediately.",
        },
        { role: "user", content },
      ],
    }),
  })

  const rawText = await aiRes.text()
  console.log("[image] status:", aiRes.status, "| body:", rawText.slice(0, 600))

  if (!aiRes.ok) {
    return NextResponse.json(
      { error: `OpenRouter error (${aiRes.status}): ${rawText.slice(0, 300)}` },
      { status: 500 },
    )
  }

  let aiJson: any
  try { aiJson = JSON.parse(rawText) } catch {
    return NextResponse.json({ error: "Non-JSON from OpenRouter: " + rawText.slice(0, 200) }, { status: 500 })
  }

  const message = aiJson.choices?.[0]?.message

  // OpenRouter image response: message.images[].imageUrl.url (primary)
  // Fallback: message.content array with { type: "image_url" } blocks
  let dataUrl: string | undefined

  if (Array.isArray(message?.images) && message.images.length > 0) {
    dataUrl = message.images[0]?.image_url?.url ?? message.images[0]?.imageUrl?.url
  }

  if (!dataUrl) {
    const blocks: any[] = Array.isArray(message?.content) ? message.content : []
    const imageBlock    = blocks.find((b: any) => b.type === "image_url")
    dataUrl             = imageBlock?.image_url?.url
  }

  if (!dataUrl) {
    const rawContent = message?.content
    const modelReply = typeof rawContent === "string"
      ? rawContent
      : JSON.stringify(rawContent ?? "").slice(0, 300)
    console.error("[image] no image found. message:", JSON.stringify(message).slice(0, 500))
    return NextResponse.json(
      { error: "Model returned text instead of an image — try a more descriptive prompt." },
      { status: 500 },
    )
  }

  // "data:image/png;base64,<b64>"
  const commaIdx = dataUrl.indexOf(",")
  const header   = dataUrl.slice(0, commaIdx)
  const b64      = dataUrl.slice(commaIdx + 1)
  const mime     = header.replace("data:", "").replace(";base64", "") || "image/png"

  await prisma.$transaction([
    prisma.wallet.update({ where: { userId: user.id }, data: { points: { decrement: cost } } }),
    prisma.executionLog.create({
      data: { userId: user.id, nodeType: "image", inputTokens: 0, outputTokens: 0, creditCost: cost, status: "SUCCESS" },
    }),
  ])

  console.log("[image] success | mime:", mime, "| b64 len:", b64.length)
  return NextResponse.json({ b64, mime })
}
