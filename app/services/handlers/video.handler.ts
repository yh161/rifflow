// Video generation handler

import { VIDEO_MODEL_MAP, DEFAULT_VIDEO_MODEL_DEF } from "../constants"
import { runReplicate, urlToBase64, extractUrl } from "../replicate"
import type { MultimodalContent } from "@/lib/prompt-resolver"
import type { JobHandler, HandlerContext } from "./types"

/** Convert a URL to a data URI if it's a local/blob URL that Replicate can't access */
async function ensurePublicUrl(url: string): Promise<string> {
  if (!url.startsWith("data:") && !url.startsWith("blob:")) return url
  if (url.startsWith("data:")) return url
  try {
    const { b64, mime } = await urlToBase64(url)
    return `data:${mime};base64,${b64}`
  } catch {
    return url
  }
}

async function executeVideoGeneration(
  content: MultimodalContent[],
  model: string,
  modelParams: Record<string, string> | undefined,
  imageSlots: Record<string, string | string[]> | undefined,
  ctx: HandlerContext,
): Promise<string> {
  const modelDef    = VIDEO_MODEL_MAP[model] ?? DEFAULT_VIDEO_MODEL_DEF
  // Fallback plain-text prompt (used by OpenRouter path and slot-based Replicate models)
  const promptText  = content.find(c => c.type === "text")?.text ?? ""

  if (modelDef.backend === "replicate") {
    let input: Record<string, unknown>

    if (modelDef.inlineImageRef) {
      // ── kling-v3-omni: convert multimodal content to <<<image_N>>> inline syntax ──
      // Images placed by the user as chips in the rich text become reference_images[].
      const refImages: string[] = []
      const promptParts: string[] = []

      for (const block of content) {
        if (block.type === "text") {
          promptParts.push(block.text)
        } else if (block.type === "image_url") {
          refImages.push(block.image_url.url)
          promptParts.push(`<<<image_${refImages.length}>>>`)
        }
      }

      input = { prompt: promptParts.join("").trim() }
      if (refImages.length > 0) input.reference_images = refImages

    } else {
      // ── Slot-based models: prompt is plain text; images come from imageSlots ──
      input = { prompt: promptText }

      if (imageSlots) {
        for (const [k, v] of Object.entries(imageSlots)) {
          if (Array.isArray(v)) {
            // array slot (e.g. reference_images) — ensure each URL is accessible
            const urls = await Promise.all(v.map(ensurePublicUrl))
            if (urls.length > 0) input[k] = urls
          } else if (v) {
            input[k] = await ensurePublicUrl(v)
          }
        }
      }
    }

    // Apply user-facing model params (duration, mode, generate_audio, etc.)
    if (modelParams) {
      for (const [k, v] of Object.entries(modelParams)) {
        if (v === "true")         input[k] = true
        else if (v === "false")   input[k] = false
        else if (/^\d+$/.test(v)) input[k] = parseInt(v, 10)
        else                      input[k] = v
      }
    }

    const output = await runReplicate(modelDef.modelPath, input, 600_000)
    return extractUrl(output)
  }

  // OpenRouter fallback
  const headers = ctx.getBaseHeaders()
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelDef.modelPath,
      messages: [{ role: "user", content: promptText }],
    }),
  })

  const rawText = await response.text()
  if (!response.ok) throw new Error(`Video model error (${response.status}): ${rawText.slice(0, 300)}`)

  const data = JSON.parse(rawText) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; video_url?: { url?: string } }>
        video?: Array<{ video_url?: { url?: string }; videoUrl?: { url?: string } }>
      }
    }>
  }
  const message = data.choices?.[0]?.message

  let videoSrc: string | undefined
  if (typeof message?.content === "string" && message.content.startsWith("http")) videoSrc = message.content
  if (!videoSrc && Array.isArray(message?.video)) {
    videoSrc = message.video[0]?.video_url?.url ?? message.video[0]?.videoUrl?.url
  }
  if (!videoSrc) {
    const blocks = Array.isArray(message?.content) ? message.content : []
    const vidBlock = blocks.find((b: { type?: string; video_url?: { url?: string } }) => b.type === "video_url")
    videoSrc = vidBlock?.video_url?.url
  }
  if (!videoSrc) throw new Error("Video model returned no URL — try a different prompt.")

  return videoSrc
}

export const videoHandler: JobHandler = {
  async execute({ content, model, modelParams, extra }, ctx) {
    const imageSlots = extra?.imageSlots as Record<string, string | string[]> | undefined
    const videoSrc = await executeVideoGeneration(content, model, modelParams, imageSlots, ctx)
    return { jobResult: { videoSrc }, inputTokens: 0, outputTokens: 0 }
  },
}
