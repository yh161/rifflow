// Template seed generation handler

import { TEXT_MODEL_DEFS, TEXT_MODEL_MAP } from "../constants"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import { runReplicate } from "../replicate"
import type { MultimodalContent } from "@/lib/prompt-resolver"
import type { JobHandler, HandlerContext } from "./types"
import type { TemplateParams } from "../job.service"
import { Prisma } from "@prisma/client"

export const templateHandler: JobHandler = {
  async execute({ jobId, userId, content, model, extra }, ctx) {
    const templateParams = extra?.templateParams as TemplateParams | undefined

    await ctx.jobRepository.updateStatus(jobId, 'running', {
      stage: 'generating_seeds',
      templateParams,
    } as unknown as Prisma.InputJsonValue)

    try {
      const maxInstances    = templateParams?.maxInstances ?? 3
      const upstreamContent = templateParams?.upstreamContent ?? ''
      const promptText      = content.find(c => c.type === 'text')?.text ?? ''

      const systemPrompt = `You are a template content generator. Respond with ONLY valid JSON — no markdown, no explanation.

Required format:
{
  "count": <number>,
  "seeds": [
    { "content": "<generated content>", "description": "<brief description>" }
  ]
}

Rules:
1. count must be a positive integer
2. seeds array must contain exactly 'count' items
3. All seeds must be meaningfully different from each other
4. Do not include any text outside the JSON object`

      const userPrompt = upstreamContent
        ? `Input context: ${upstreamContent}\n\nRequest: ${promptText}`
        : promptText

      const modelDef = TEXT_MODEL_DEFS[model]

      let rawText: string

      if (modelDef?.backend === 'replicate') {
        const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`
        const tokenParam = modelDef.tokenParam ?? 'max_new_tokens'
        const templateInput: Record<string, unknown> = { prompt: combinedPrompt, [tokenParam]: 2000 }
        if (!modelDef.noTemperature) templateInput.temperature = 0.7
        const replicateOutput = await runReplicate(modelDef.modelPath, templateInput)
        rawText = Array.isArray(replicateOutput)
          ? (replicateOutput as string[]).join('')
          : String(replicateOutput ?? '')
      } else {
        const orModel = TEXT_MODEL_MAP[model] ?? TEXT_MODEL_MAP[DEFAULT_TEXT_MODEL_ID] ?? 'deepseek/deepseek-chat'
        const headers  = ctx.getBaseHeaders()

        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method:  'POST',
          headers,
          body: JSON.stringify({
            model:           orModel,
            messages:        [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userPrompt   },
            ],
            response_format: { type: 'json_object' },
          }),
        })

        if (!aiRes.ok) {
          throw new Error(`Seed LLM error (${aiRes.status}): ${await aiRes.text()}`)
        }

        const aiJson = await aiRes.json()
        rawText = aiJson.choices?.[0]?.message?.content ?? ''
      }

      let parsed: { count: number; seeds: Array<{ content: string; description?: string }> }

      try {
        parsed = JSON.parse(rawText)
      } catch {
        const match = rawText.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('Non-JSON response from seed LLM')
        parsed = JSON.parse(match[0])
      }

      if (!Array.isArray(parsed.seeds) || parsed.seeds.length === 0) {
        throw new Error('LLM returned no seeds')
      }

      const seeds = parsed.seeds.slice(0, maxInstances).map((s, i) => ({
        content:     s.content     || `Variation ${i + 1}`,
        description: s.description || `Instance ${i + 1}`,
      }))

      await ctx.walletRepository.updateBalance(userId, -1)
      await ctx.executionLogRepository.create({
        userId,
        nodeType:     'template',
        inputTokens:  0,
        outputTokens: 0,
        creditCost:   1,
        status:       'SUCCESS',
      })

      await ctx.jobRepository.updateStatus(jobId, 'running', {
        stage:       'seeds_ready',
        templateParams,
        seeds,
      } as unknown as Prisma.InputJsonValue)

      return { selfManaged: true }
    } catch (err: unknown) {
      console.error('[templateHandler] execute failed:', err)
      await ctx.jobRepository.updateStatus(
        jobId, 'failed', undefined,
        err instanceof Error ? err.message : 'Seed generation failed',
      )
      return { selfManaged: true }
    }
  },
}
