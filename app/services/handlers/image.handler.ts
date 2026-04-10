// Image generation handler

import { IMAGE_MODEL_MAP, DEFAULT_IMAGE_MODEL_DEF } from "../constants"
import { runReplicate, urlToBase64, extractUrl } from "../replicate"
import type { MultimodalContent } from "@/lib/prompt-resolver"
import type { JobHandler, HandlerContext } from "./types"
import { uploadFile, ensureStorage } from "@/lib/storage"

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

async function executeImageGeneration(
  content: MultimodalContent[],
  model: string,
  modelParams: Record<string, string> | undefined,
  imageSlots: Record<string, string | string[]> | undefined,
  ctx: HandlerContext,
): Promise<{ b64: string; mime: string }> {
  const modelDef = IMAGE_MODEL_MAP[model] ?? DEFAULT_IMAGE_MODEL_DEF
  // Join all text blocks (handles multimodal content with interleaved text+chips)
  const promptText = content.filter(c => c.type === "text").map(c => c.text).join("").trim()

  if (modelDef.backend === "replicate") {
    const input: Record<string, unknown> = { prompt: promptText }

    if (imageSlots && Object.keys(imageSlots).length > 0) {
      // Slot-based image input (e.g. nano-banana-pro with named image_input[] slots)
      for (const [k, v] of Object.entries(imageSlots)) {
        if (Array.isArray(v)) {
          const urls = await Promise.all(v.map(ensurePublicUrl))
          if (urls.length > 0) input[k] = urls
        } else if (v) {
          input[k] = await ensurePublicUrl(v)
        }
      }
    } else {
      // Legacy / OpenRouter-style: extract image_url blocks from multimodal content
      const imageDataUris = await Promise.all(
        content
          .filter(c => c.type === "image_url")
          .map(c => (c as { type: string; image_url: { url: string } }).image_url.url)
          .filter(url => url.startsWith("http") || url.startsWith("data:"))
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
      if (imageDataUris.length > 0) input.image_input = imageDataUris
    }

    if (modelParams) {
      for (const [k, v] of Object.entries(modelParams)) {
        input[k] = v
      }
    }
    const output = await runReplicate(modelDef.modelPath, input)
    const imageUrl = extractUrl(output)
    const { b64, mime } = await urlToBase64(imageUrl)
    return { b64, mime }
  }

  // OpenRouter fallback
  const headers = ctx.getBaseHeaders()
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelDef.modelPath,
      modalities: modelDef.modalities,
      messages: [
        { role: "system", content: "You are an image generation assistant. Always generate an image directly based on the user's description. Never ask for clarification." },
        { role: "user", content }
      ]
    })
  })

  const rawText = await response.text()
  if (!response.ok) throw new Error(`Image model error (${response.status}): ${rawText.slice(0, 300)}`)

  const data = JSON.parse(rawText) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; image_url?: { url?: string } }>
        images?: Array<{ image_url?: { url?: string }; imageUrl?: { url?: string } }>
      }
    }>
  }
  const message = data.choices?.[0]?.message

  let dataUrl: string | undefined
  if (Array.isArray(message?.images) && message.images.length > 0) {
    dataUrl = message.images[0]?.image_url?.url ?? message.images[0]?.imageUrl?.url
  }
  if (!dataUrl) {
    const blocks = Array.isArray(message?.content) ? message.content : []
    const imgBlock = blocks.find((b: { type?: string; image_url?: { url?: string } }) => b.type === "image_url")
    dataUrl = imgBlock?.image_url?.url
  }
  if (!dataUrl) throw new Error("Model returned text instead of an image — try a more descriptive prompt.")

  const commaIdx = dataUrl.indexOf(",")
  const b64 = dataUrl.slice(commaIdx + 1)
  const mime = dataUrl.slice(0, commaIdx).replace("data:", "").replace(";base64", "") || "image/png"
  return { b64, mime }
}

export const imageHandler: JobHandler = {
  async execute({ content, model, modelParams, userId, extra }, ctx) {
    const imageSlots = extra?.imageSlots as Record<string, string | string[]> | undefined
    const { b64, mime } = await executeImageGeneration(content, model, modelParams, imageSlots, ctx)

    // Upload to MinIO server-side
    try {
      await ensureStorage()
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "png"
      const key = `${userId}/gen_${Date.now()}.${ext}`
      const buf = Buffer.from(b64, "base64")
      await uploadFile(key, buf, mime)
      return { jobResult: { src: key, mime }, inputTokens: 0, outputTokens: 0 }
    } catch (uploadErr) {
      console.warn("[imageHandler] MinIO upload failed, falling back to b64 storage:", uploadErr)
      return { jobResult: { b64, mime }, inputTokens: 0, outputTokens: 0 }
    }
  },
}
