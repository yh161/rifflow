// Video generation handler

import { VIDEO_MODEL_MAP, DEFAULT_VIDEO_MODEL_DEF } from "../constants"
import { runReplicate, urlToBase64, extractUrl } from "../replicate"
import type { MultimodalContent } from "@/lib/prompt-resolver"
import type { JobHandler, HandlerContext } from "./types"

async function executeVideoGeneration(
  content: MultimodalContent[],
  model: string,
  modelParams: Record<string, string> | undefined,
  ctx: HandlerContext,
): Promise<string> {
  const modelDef = VIDEO_MODEL_MAP[model] ?? DEFAULT_VIDEO_MODEL_DEF
  const promptText = content.find(c => c.type === "text")?.text ?? ""
  const imageBlock = content.find(c => c.type === "image_url") as { type: string; image_url: { url: string } } | undefined
  const imageUrl = imageBlock?.image_url?.url

  if (modelDef.backend === "replicate") {
    const input: Record<string, unknown> = { prompt: promptText }
    if (imageUrl) {
      if (imageUrl.startsWith("data:")) {
        input.image = imageUrl
      } else {
        try {
          const { b64, mime } = await urlToBase64(imageUrl)
          input.image = `data:${mime};base64,${b64}`
        } catch {
          input.image = imageUrl
        }
      }
    }
    if (modelParams) {
      for (const [k, v] of Object.entries(modelParams)) {
        input[k] = /^\d+$/.test(v) ? parseInt(v, 10) : v
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
  async execute({ content, model, modelParams }, ctx) {
    const videoSrc = await executeVideoGeneration(content, model, modelParams, ctx)
    return { jobResult: { videoSrc }, inputTokens: 0, outputTokens: 0 }
  },
}
