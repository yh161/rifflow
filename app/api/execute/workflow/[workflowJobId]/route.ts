import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { WorkflowEngine } from "@/app/services/workflow.service"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ workflowJobId: string }> }

/**
 * PATCH /api/execute/workflow/[workflowJobId]
 * Control a running workflow: pause | resume | stop
 *
 * Body: { "action": "pause" | "resume" | "stop" }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { workflowJobId } = await params
  const { action } = await req.json() as { action: string }

  if (!["pause", "resume", "stop"].includes(action)) {
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

  if (action === "pause")  await engine.pauseWorkflow(workflowJobId)
  if (action === "resume") await engine.resumeWorkflow(workflowJobId)
  if (action === "stop")   await engine.stopWorkflow(workflowJobId)

  return NextResponse.json({ ok: true, action })
}
