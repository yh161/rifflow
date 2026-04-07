import type { ResultHandlerContext } from '../_registry'

/**
 * Text result handler — writes result.content to node data.
 * Also used as the default fallback for modules without a custom handler.
 */
export async function resultHandler(
  result: Record<string, unknown>,
  ctx: ResultHandlerContext,
): Promise<void> {
  ctx.setNodes(ns => ns.map(n =>
    n.id !== ctx.nodeId ? n : {
      ...n,
      data: {
        ...n.data,
        content:         result.content,
        done:            true,
        isGenerating:    false,
        activeJobId:     undefined,
        generationCount: (n.data.generationCount ?? 0) + 1,
      },
    }
  ))
}
