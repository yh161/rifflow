// ─────────────────────────────────────────────
// Console — Client-side DAG parser
// Builds a topologically sorted execution plan
// from canvas nodes and edges.
// ─────────────────────────────────────────────

import type { Node, Edge } from "reactflow"
import type { CustomNodeData } from "../modules/_types"
import type { ConsoleTask } from "./console-types"

const EXECUTABLE_TYPES = new Set(["text", "image", "video", "pdf", "filter", "seed"])

/**
 * Build a flat, topologically-sorted task list from canvas graph.
 * Nodes within the same DAG level share a `batchIndex` and can
 * theoretically run in parallel.
 */
export function buildExecutionPlan(nodes: Node[], edges: Edge[]): ConsoleTask[] {
  // Filter to executable nodes (skip containers, ghosts, standard, etc.)
  const execNodes = nodes.filter((n) => {
    const type = (n.data as CustomNodeData)?.type
    return type && EXECUTABLE_TYPES.has(type)
  })

  if (execNodes.length === 0) return []

  const nodeIds = new Set(execNodes.map((n) => n.id))

  // Build adjacency list and in-degree map
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const n of execNodes) {
    adjacency.set(n.id, [])
    inDegree.set(n.id, 0)
  }

  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    adjacency.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
  }

  // Kahn's algorithm with batch tracking
  const tasks: ConsoleTask[] = []
  let queue = [...inDegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
  let batchIndex = 0

  while (queue.length > 0) {
    const nextQueue: string[] = []

    for (const nodeId of queue) {
      const node = execNodes.find((n) => n.id === nodeId)!
      const data = node.data as CustomNodeData
      const rawMode = data.mode as string | undefined
      const mode = (rawMode === "done" ? "note" : rawMode) as "auto" | "manual" | "note" | undefined

      tasks.push({
        nodeId,
        label: data.label || data.type || nodeId.slice(-6),
        type: data.type || "text",
        mode: mode || "manual",
        done: data.done === true || rawMode === "note" || rawMode === "done",
        hasPrompt: !!(data.prompt?.trim()),
        status: "pending",
        batchIndex,
      })

      for (const neighbor of adjacency.get(nodeId) || []) {
        const newDeg = (inDegree.get(neighbor) || 0) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) nextQueue.push(neighbor)
      }
    }

    queue = nextQueue
    batchIndex++
  }

  return tasks
}

/**
 * Collect upstream data for a node (for prompt reference resolution).
 * Returns the same shape expected by /api/jobs upstreamData.
 */
export function collectUpstreamData(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Array<{ id: string; type: string; content: string; src?: string }> {
  const incoming = edges.filter((e) => e.target === nodeId)
  const result: Array<{ id: string; type: string; content: string; src?: string }> = []

  for (const edge of incoming) {
    const src = nodes.find((n) => n.id === edge.source)
    if (!src) continue
    const d = src.data as CustomNodeData
    result.push({
      id: edge.source,
      type: d.type || "text",
      content: d.content || "",
      src: d.src,
    })
  }

  return result
}

/**
 * Get node IDs in a specific batch (DAG level).
 */
export function getNodesInBatch(tasks: ConsoleTask[], batchIndex: number): string[] {
  return tasks.filter((t) => t.batchIndex === batchIndex).map((t) => t.nodeId)
}

/**
 * Get the maximum batch index.
 */
export function getMaxBatch(tasks: ConsoleTask[]): number {
  if (tasks.length === 0) return -1
  return Math.max(...tasks.map((t) => t.batchIndex))
}
