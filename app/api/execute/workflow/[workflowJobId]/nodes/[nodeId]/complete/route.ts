import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { WorkflowEngine } from "@/app/services/workflow.service"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ workflowJobId: string; nodeId: string }> }

/**
 * POST /api/execute/workflow/[workflowJobId]/nodes/[nodeId]/complete
 * Signal a manual node completion from the console frontend.
 *
 * Body: {
 *   "action": "complete" | "skip",
 *   "result": { "content": "..." }   // optional for complete
 * }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { workflowJobId, nodeId } = await params
  const body = await req.json() as {
    action: "complete" | "skip"
    result?: Record<string, unknown>
  }

  if (!["complete", "skip"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  // Verify ownership
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const wf = await prisma.workflowJob.findUnique({ where: { id: workflowJobId } })
  if (!wf || wf.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const engine = new WorkflowEngine()
  await engine.completeManualNode(workflowJobId, nodeId, body.action, body.result)

  return NextResponse.json({ ok: true })
}
