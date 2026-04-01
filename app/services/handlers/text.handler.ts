// Text generation handler

import { TEXT_MODEL_DEFS, TEXT_MODEL_MAP } from "../constants"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import { runReplicate, urlToBase64 } from "../replicate"
import type { MultimodalContent } from "@/lib/prompt-resolver"
import type { JobHandler, HandlerContext, TextGenerationResult } from "./types"

/**
 * Core text generation — used by text, seed, and filter handlers.
 * Exported so other handlers can compose with it.
 */
export async function executeTextGeneration(
  content: MultimodalContent[],
  model: string,
  modelParams: Record<string, string> | undefined,
  ctx: HandlerContext,
): Promise<TextGenerationResult> {
  const modelDef    = TEXT_MODEL_DEFS[model]
  const temperature = modelParams?.temperature ? parseFloat(modelParams.temperature) : 0.7

  // ── Replicate path ──────────────────────────────────────────────────────
  if (modelDef?.backend === 'replicate') {
    if (modelDef.supportsImageInput) {
      const promptText = content
        .filter(c => c.type === 'text')
        .map(c => (c as { type: string; text: string }).text)
        .join('\n')
        .trim()

      const imageDataUris: string[] = await Promise.all(
        content
          .filter(c => c.type === 'image_url')
          .map(c => (c as { type: string; image_url: { url: string } }).image_url.url)
          .map(async url => {
            if (url.startsWith('data:')) return url
            try {
              const { b64, mime } = await urlToBase64(url)
              return `data:${mime};base64,${b64}`
            } catch {
              return url
            }
          })
      )

      const replicateInput: Record<string, unknown> = {
        prompt: promptText || 'Describe the content of the provided image(s).',
      }

      if (imageDataUris.length > 0 && modelDef.imageParam) {
        replicateInput[modelDef.imageParam] = modelDef.imageSingle
          // Single-image models (e.g. Claude image field) can only accept one input.
          // Prefer the latest referenced image instead of the first one so PDF nodes
          // with multiple outputs (e.g. default p1 + manually added p6) don't
          // always collapse to the cover page.
          ? imageDataUris[imageDataUris.length - 1]
          : imageDataUris
      }

      const tokenParam = modelDef.tokenParam ?? 'max_output_tokens'
      replicateInput[tokenParam] = 8192
      if (!modelDef.noTemperature) replicateInput.temperature = temperature
      if (modelParams && modelDef.extraParamKeys) {
        for (const key of modelDef.extraParamKeys) {
          if (modelParams[key] !== undefined) {
            const v = modelParams[key]
            replicateInput[key] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
          }
        }
      }

      const replicateOutput = await runReplicate(modelDef.modelPath, replicateInput)
      const text = Array.isArray(replicateOutput)
        ? (replicateOutput as string[]).join('')
        : String(replicateOutput ?? '')
      return { content: text, _inputTokens: 0, _outputTokens: 0 }

    } else {
      const promptText = content
        .filter(c => c.type === 'text')
        .map(c => (c as { type: string; text: string }).text)
        .join('\n')

      const tokenParam = modelDef.tokenParam ?? 'max_new_tokens'
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
      const replicateOutput = await runReplicate(modelDef.modelPath, replicateInput)
      const text = Array.isArray(replicateOutput)
        ? (replicateOutput as string[]).join('')
        : String(replicateOutput ?? '')
      return { content: text, _inputTokens: 0, _outputTokens: 0 }
    }
  }

  // ── OpenRouter path ─────────────────────────────────────────────────────
  const orModel = TEXT_MODEL_MAP[model] ?? TEXT_MODEL_MAP[DEFAULT_TEXT_MODEL_ID] ?? 'deepseek/deepseek-chat'
  const headers = ctx.getBaseHeaders()

  const apiContent: MultimodalContent[] = modelDef?.supportsImageInput
    ? content
    : content.filter(c => c.type === 'text')

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: orModel,
      messages: [{ role: "user", content: apiContent.length > 0 ? apiContent : content }],
      ...(temperature !== undefined && { temperature }),
    })
  })

  if (!response.ok) {
    throw new Error(`Text model error (${response.status}): ${await response.text()}`)
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const rawContent = data.choices?.[0]?.message?.content
  const contentStr = typeof rawContent === 'string' ? rawContent : ''
  return {
    content: contentStr,
    _inputTokens: data.usage?.prompt_tokens || 0,
    _outputTokens: data.usage?.completion_tokens || 0,
  }
}

export const textHandler: JobHandler = {
  async execute({ content, model, modelParams }, ctx) {
    const result = await executeTextGeneration(content, model, modelParams, ctx)
    return {
      jobResult: { content: result.content },
      inputTokens: result._inputTokens,
      outputTokens: result._outputTokens,
    }
  },
}
