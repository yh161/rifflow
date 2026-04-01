import type { ResultHandlerContext } from '../_registry'

/**
 * Filter result handler:
 * Computes output content = joined content of passed nodes.
 * This is what downstream nodes see when they reference {{filterId}}.
 */
export async function resultHandler(
  result: Record<string, any>,
  ctx: ResultHandlerContext,
): Promise<void> {
  const filterResult = result.filterResult as {
    passed:   Array<{ id: string; label?: string; type?: string }>
    filtered: Array<{ id: string; label?: string; type?: string }>
    reply?:   string
  } | undefined

  // Compute output content from passed nodes
  const currentNodes = ctx.getNodes()
  const passedContent = (filterResult?.passed ?? [])
    .map((item) => {
      const n = currentNodes.find((node) => node.id === item.id)
      if (!n) return ''
      const d = n.data as any
      return d?.content || d?.src || d?.videoSrc || ''
    })
    .filter(Boolean)
    .join('\n\n')

  ctx.setNodes(ns => ns.map(n =>
    n.id !== ctx.nodeId ? n : {
      ...n,
      data: {
        ...n.data,
        content:      passedContent,
        filterResult,
        isGenerating: false,
        activeJobId:  undefined,
      },
    }
  ))
}
