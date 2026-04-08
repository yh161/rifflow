import type { ResultHandlerContext } from '../_registry'
import type { TemplateJobResult } from '@/app/services/job.service'

/**
 * Template result handler:
 * Applies instanceResults to all instance nodes.
 */
export async function resultHandler(
  result: Record<string, unknown>,
  ctx: ResultHandlerContext,
): Promise<void> {
  const templateResult     = result as unknown as TemplateJobResult
  const stage = templateResult.stage
  const instanceResults = (templateResult.instanceResults ?? {}) as Record<string, unknown>

  ctx.setNodes(ns => ns.map(n => {
    if (n.id === ctx.nodeId) {
      // Keep container running state until the template job is truly done.
      if (stage !== 'done') return n
      return { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
    }
    const nodeResult = instanceResults[n.id]
    if (!nodeResult || typeof nodeResult !== 'object') return n
    if ('content' in nodeResult) {
      return { ...n, data: { ...n.data, content: (nodeResult as Record<string, unknown>).content, isGenerating: false } }
    }
    return n
  }))
}
