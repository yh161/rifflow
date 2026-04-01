import type { ResultHandlerContext } from '../_registry'
import type { TemplateJobResult } from '@/app/services/job.service'

/**
 * Template result handler:
 * Applies instanceResults to all instance nodes.
 */
export async function resultHandler(
  result: Record<string, any>,
  ctx: ResultHandlerContext,
): Promise<void> {
  const templateResult     = result as TemplateJobResult
  const instanceResults = (templateResult.instanceResults ?? {}) as Record<string, any>

  ctx.setNodes(ns => ns.map(n => {
    if (n.id === ctx.nodeId) {
      return { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
    }
    const nodeResult = instanceResults[n.id]
    if (!nodeResult) return n
    if ('content' in nodeResult) {
      return { ...n, data: { ...n.data, content: nodeResult.content, isGenerating: false } }
    }
    return n
  }))
}
