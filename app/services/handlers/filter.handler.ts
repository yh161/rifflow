// Filter generation handler

import { executeTextGeneration } from "./text.handler"
import { calculateCreditCost } from "@/lib/credits"
import type { JobHandler, HandlerContext } from "./types"
import type { FilterItemParam } from "../job.service"

function parseFilterLLMResponse(
  rawContent: string,
  items: FilterItemParam[],
): { passed: FilterItemParam[]; filtered: FilterItemParam[]; reply?: string } | null {
  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*"passed"[\s\S]*\}/)
    const jsonStr   = jsonMatch ? jsonMatch[0] : rawContent.trim()
    const parsed    = JSON.parse(jsonStr) as { passed?: number[]; filtered?: number[]; reply?: string }

    if (!parsed.passed && !parsed.filtered) return null

    const passedSet = new Set((parsed.passed ?? []).map((n: number) => n - 1))
    return {
      passed:   items.filter((_, i) => passedSet.has(i)).map(it => ({ id: it.id, label: it.label, type: it.type })),
      filtered: items.filter((_, i) => !passedSet.has(i)).map(it => ({ id: it.id, label: it.label, type: it.type })),
      reply:    parsed.reply,
    }
  } catch {
    return null
  }
}

export const filterHandler: JobHandler = {
  async execute({ jobId, userId, content, model, extra }, ctx) {
    await ctx.jobRepository.updateStatus(jobId, 'running')

    try {
      const result = await executeTextGeneration(content, model, undefined, ctx)
      const rawContent = result.content

      const filterItems = extra?.filterItems as FilterItemParam[] | undefined
      let filterResult: { passed: FilterItemParam[]; filtered: FilterItemParam[]; reply?: string }

      if (filterItems && filterItems.length > 0) {
        const parsed = parseFilterLLMResponse(rawContent, filterItems)
        filterResult = parsed ?? {
          passed: filterItems.map(i => ({ id: i.id, label: i.label, type: i.type })),
          filtered: [],
        }
      } else {
        filterResult = { passed: [], filtered: [] }
      }

      const cost = calculateCreditCost(model)
      await ctx.walletRepository.updateBalance(userId, -cost)
      await ctx.executionLogRepository.create({
        userId,
        nodeType:     'filter',
        inputTokens:  result._inputTokens,
        outputTokens: result._outputTokens,
        creditCost:   cost,
        status:       'SUCCESS',
      })

      await ctx.jobRepository.updateStatus(jobId, 'done', {
        content: rawContent,
        filterResult,
        reply: filterResult.reply,
      })

      return { selfManaged: true }
    } catch (err: unknown) {
      console.error('[filterHandler] execute failed:', err)
      await ctx.jobRepository.updateStatus(
        jobId, 'failed', undefined,
        err instanceof Error ? err.message : 'Filter execution failed',
      )
      return { selfManaged: true }
    }
  },
}
