import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { WorkflowEngine } from "@/app/services/workflow.service"
import { prisma } from "@/lib/prisma"

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

    // Filter executable nodes (exclude container/seed nodes)
    const executableTypes = ["text", "image", "video", "gate"]
    const executableNodes = nodes.filter(
      (n) => executableTypes.includes(n.data?.type) || executableTypes.includes(n.type)
    )

    if (executableNodes.length === 0) {
      return NextResponse.json(
        { error: "No executable nodes found in selection" },
        { status: 400 }
      )
    }

    // Check credits (estimate 1 point per node)
    const estimatedCost = executableNodes.length
    if (!user.wallet || user.wallet.points < estimatedCost) {
      return NextResponse.json(
        { error: "Insufficient credits", required: estimatedCost },
        { status: 402 }
      )
    }

    // Transform to workflow format
    const workflowNodes = executableNodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data || {},
    }))

    // Filter edges to only include connections between selected nodes
    const nodeIds = new Set(executableNodes.map((n) => n.id))
    const workflowEdges = edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }))

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
      totalNodes: executableNodes.length,
    })
  } catch (err: any) {
    console.error("[execute/workflow] unhandled:", err)
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
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
  } catch (err: any) {
    console.error("[execute/workflow] status error:", err)
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    )
  }
}