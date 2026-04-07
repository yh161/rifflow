import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { WorkflowEngine } from "@/app/services/workflow.service"
import { prisma } from "@/lib/prisma"
import { estimateWorkflowBudget } from "@/lib/credits"

function nodeTypeOf(node: { type?: string; data?: Record<string, unknown> }): string {
  return String(node.data?.type ?? node.type ?? "")
}

function isPromptSkippableNode(node: { type?: string; data?: Record<string, unknown> }): boolean {
  const nodeType = nodeTypeOf(node)
  // Keep filter nodes executable even without prompt because they now support
  // explicit non-LLM output selection semantics.
  if (nodeType === "text" || nodeType === "seed" || nodeType === "pdf") {
    const prompt = String(node.data?.prompt ?? "")
    return prompt.trim().length === 0
  }
  return false
}

function hasCycle(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string }>,
): boolean {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adjacency.set(n.id, [])
  }

  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    adjacency.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  const queue: string[] = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id)

  let visited = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    visited += 1
    for (const nei of adjacency.get(id) ?? []) {
      const next = (inDegree.get(nei) ?? 0) - 1
      inDegree.set(nei, next)
      if (next === 0) queue.push(nei)
    }
  }

  return visited !== nodes.length
}

/**
 * POST /api/execute/workflow
 * Execute a subgraph as a workflow
 * 
 * Request body:
 * {
 *   lassoNodeId: string,     // ID of the lasso container node
 *   nodes: Node[],           // All nodes inside the lasso
 *   edges: Edge[],           // Edges between those nodes
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { lassoNodeId, nodes, edges } = await req.json()

    if (!lassoNodeId || !Array.isArray(nodes) || !Array.isArray(edges)) {
      return NextResponse.json(
        { error: "Missing required fields: lassoNodeId, nodes, edges" },
        { status: 400 }
      )
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { wallet: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Filter executable nodes.
    // - seed nodes are template-internal and must not run standalone.
    // - template container itself is executable.
    // - template instance child nodes are excluded here (executed by template workflows).
    const executableTypes = ["text", "image", "video", "pdf", "filter", "template", "standard"]
    const executableNodes = nodes.filter((n) => {
      const nodeType = n.data?.type ?? n.type
      if (!executableTypes.includes(nodeType)) return false
      if (n.data?.templateId) return false
      return true
    })

    // Prune prompt-skippable nodes before any graph validation.
    // This avoids false cycle failures caused by nodes that won't execute.
    const effectiveNodes = executableNodes.filter((n) => !isPromptSkippableNode(n))

    if (effectiveNodes.length === 0) {
      return NextResponse.json(
        { error: "No executable nodes found in selection" },
        { status: 400 }
      )
    }

    // Check credits with real model-aware estimation
    const estimatedCost = estimateWorkflowBudget(effectiveNodes, nodes).max
    if (!user.wallet || user.wallet.points < estimatedCost) {
      return NextResponse.json(
        { error: "Insufficient credits", required: estimatedCost },
        { status: 402 }
      )
    }

    // Transform to workflow format
    const workflowNodes = effectiveNodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data || {},
    }))

    // Filter edges to only include connections between selected nodes
    const nodeIds = new Set(effectiveNodes.map((n) => n.id))
    const workflowEdges = edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.targetHandle && { targetHandle: e.targetHandle }),
      }))

    if (hasCycle(workflowNodes, workflowEdges)) {
      return NextResponse.json(
        { error: "Cycle detected in effective executable graph (after skipping no-prompt nodes)" },
        { status: 400 }
      )
    }

    // Execute workflow
    const engine = new WorkflowEngine()
    const result = await engine.executeWorkflow(
      user.id,
      { nodes: workflowNodes, edges: workflowEdges }
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Workflow execution failed" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      workflowJobId: result.workflowJobId,
      status: "started",
      totalNodes: effectiveNodes.length,
    })
  } catch (err: unknown) {
    console.error("[execute/workflow] unhandled:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/execute/workflow?workflowJobId=xxx
 * Get workflow execution status
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const workflowJobId = searchParams.get("workflowJobId")

    if (!workflowJobId) {
      return NextResponse.json(
        { error: "Missing workflowJobId parameter" },
        { status: 400 }
      )
    }

    const engine = new WorkflowEngine()
    const status = await engine.getWorkflowStatus(workflowJobId)

    if (!status) {
      return NextResponse.json(
        { error: "Workflow job not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(status)
  } catch (err: unknown) {
    console.error("[execute/workflow] status error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}