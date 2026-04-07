import type { ResultHandlerContext } from '../_registry'
import type { CustomNodeData } from '../_types'

/**
 * Filter result handler:
 * Output content = joined content of union(manual selected nodes, AI passed nodes).
 * Manual selections (filterSelectedIds) are always preserved.
 * AI result (filterResult) replaces the previous AI result only.
 */
export async function resultHandler(
  result: Record<string, unknown>,
  ctx: ResultHandlerContext,
): Promise<void> {
  const filterResult = result.filterResult as {
    passed:   Array<{ id: string; label?: string; type?: string }>
    filtered: Array<{ id: string; label?: string; type?: string }>
    reply?:   string
  } | undefined

  const currentNodes = ctx.getNodes()
  const node = currentNodes.find((n) => n.id === ctx.nodeId)
  const data = node?.data as (CustomNodeData & Record<string, unknown>) | undefined

  // Manual selections — already resolved from filterOutputRules by NodeUI useEffect
  const manualIds = new Set<string>(
    Array.isArray(data?.filterSelectedIds)
      ? (data.filterSelectedIds as string[])
      : [],
  )

  // AI passed IDs
  const aiPassedIds = new Set<string>((filterResult?.passed ?? []).map((i) => i.id))

  // Union: manual always included; AI is the complement
  const allPassedIds = new Set([...manualIds, ...aiPassedIds])

  // Compute output content from the union
  const passedContent = currentNodes
    .filter((n) => allPassedIds.has(n.id))
    .map((n) => {
      const d = n.data as Record<string, unknown>
      const value = d?.content ?? d?.src ?? d?.videoSrc
      return typeof value === 'string' ? value : ''
    })
    .filter(Boolean)
    .join('\n\n')

  ctx.setNodes((ns) =>
    ns.map((n) =>
      n.id !== ctx.nodeId
        ? n
        : {
            ...n,
            data: {
              ...n.data,
              content:      passedContent,
              filterResult,              // stores AI result only; manual stays in filterOutputRules
              done:         true,
              isGenerating: false,
              activeJobId:  undefined,
            },
          },
    ),
  )
}
