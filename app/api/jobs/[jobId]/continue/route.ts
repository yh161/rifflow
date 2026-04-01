import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { WorkflowEngine } from "@/app/services/workflow.service"
import type { TemplateJobResult } from "@/app/services/job.service"
import type { Prisma } from "@prisma/client"

// ─────────────────────────────────────────────
// POST /api/jobs/[jobId]/continue
//
// Called by the frontend after it has:
//   1. Received seeds from the template job (stage='seeds_ready')
//   2. Created all instances (onTemplateAddInstance)
//   3. Filled each seed node with generated content
//
// Body: {
//   instances: Array<{
//     instanceIdx: number
//     nodes: WorkflowNode[]
//     edges: WorkflowEdge[]
//   }>
// }
//
// This fires off WorkflowEngine for each instance sequentially,
// updates job.result.workflowProgress after each, and sets
// job.status='done' when all complete.
// ─────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { jobId } = await params

  // Validate job ownership and stage
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const existingResult = (job.result ?? {}) as unknown as TemplateJobResult
  if (existingResult.stage !== "seeds_ready") {
    return NextResponse.json(
      { error: `Wrong stage: expected seeds_ready, got ${existingResult.stage}` },
      { status: 400 },
    )
  }

  const { instances } = await req.json() as {
    instances: Array<{
      instanceIdx: number
      nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>
      edges: Array<{ id: string; source: string; target: string }>
    }>
  }

  if (!Array.isArray(instances) || instances.length === 0) {
    return NextResponse.json({ error: "instances array is required" }, { status: 400 })
  }

  // Transition to executing_workflows immediately
  const initResult: TemplateJobResult = {
    ...existingResult,
    stage:            "executing_workflows",
    workflowProgress: { current: 0, total: instances.length },
    instanceResults:  {},
  }
  await prisma.job.update({
    where: { id: jobId },
    data:  { result: initResult as unknown as Prisma.InputJsonValue },
  })

  // Fire-and-forget: execute each instance workflow sequentially
  void runTemplateWorkflows(jobId, session.user.id, instances, existingResult)

  return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────
// runTemplateWorkflows — runs in the background
// ─────────────────────────────────────────────
async function runTemplateWorkflows(
  jobId:          string,
  userId:         string,
  instances:      Array<{
    instanceIdx: number
    nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>
    edges: Array<{ id: string; source: string; target: string }>
  }>,
  existingResult: TemplateJobResult,
): Promise<void> {
  const engine          = new WorkflowEngine()
  const allResults:      Record<string, unknown> = {}
  const total           = instances.length

  try {
    for (let i = 0; i < instances.length; i++) {
      const { nodes, edges } = instances[i]

      // Start workflow for this instance
      const { workflowJobId, success } = await engine.executeWorkflow(userId, { nodes, edges })
      if (!success) {
        console.error(`[template/continue] Instance ${i} workflow failed to start`)
        continue
      }

      // Poll DB directly until workflow completes (no HTTP round-trip)
      const wfResult = await waitForWorkflow(workflowJobId)
      if (wfResult) {
        Object.assign(allResults, wfResult)
      }

      // Update progress in job.result after each instance
      const current   = i + 1
      const progResult: TemplateJobResult = {
        ...existingResult,
        stage:            "executing_workflows",
        workflowProgress: { current, total },
        instanceResults:  allResults,
      }
      await prisma.job.update({
        where: { id: jobId },
        data:  { result: progResult as unknown as Prisma.InputJsonValue },
      })
    }

    // All instances done
    const doneResult: TemplateJobResult = {
      ...existingResult,
      stage:            "done",
      workflowProgress: { current: total, total },
      instanceResults:  allResults,
    }
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "done",
        result: doneResult as unknown as Prisma.InputJsonValue,
      },
    })

  } catch (err: unknown) {
    console.error("[template/continue] runTemplateWorkflows failed:", err)
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error:  err instanceof Error ? err.message : "Template workflow execution failed",
      },
    })
  }
}

// ─────────────────────────────────────────────
// waitForWorkflow — polls prisma until completed/failed
// Returns the results map or null on failure
// ─────────────────────────────────────────────
async function waitForWorkflow(
  workflowJobId: string,
  timeoutMs = 10 * 60 * 1000, // 10 min max per instance
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs
  const POLL_MS  = 800

  while (Date.now() < deadline) {
    const wfJob = await prisma.workflowJob.findUnique({
      where: { id: workflowJobId },
    })

    if (!wfJob) return null

    if (wfJob.status === "completed") {
      return (wfJob.results ?? {}) as Record<string, unknown>
    }

    if (wfJob.status === "failed") {
      console.error(`[template/continue] Workflow ${workflowJobId} failed:`, wfJob.error)
      return null
    }

    // pending | running → keep polling
    await new Promise(r => setTimeout(r, POLL_MS))
  }

  console.error(`[template/continue] Workflow ${workflowJobId} timed out`)
  return null
}
