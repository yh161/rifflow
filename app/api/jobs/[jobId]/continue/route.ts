import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { WorkflowEngine } from "@/app/services/workflow.service"
import type { TemplateJobResult } from "@/app/services/job.service"
import type { Prisma } from "@prisma/client"

type TemplateWorkflowStatusRecord = NonNullable<TemplateJobResult['workflowNodeStatuses']>

function buildWorkflowNodeStatuses(
  workflow: {
    id: string
    results: Prisma.JsonValue | null
    jobs: Array<{
      id: string
      nodeId: string
      nodeType: string
      status: string
      error: string | null
    }>
  },
): TemplateWorkflowStatusRecord {
  const nodeStatuses: TemplateWorkflowStatusRecord = {}

  for (const job of workflow.jobs) {
    nodeStatuses[job.nodeId] = {
      nodeId: job.nodeId,
      nodeType: job.nodeType,
      status: job.status,
      jobId: job.id,
      error: job.error,
    }
  }

  const rawResults = (workflow.results ?? {}) as Record<string, unknown>
  const workflowMeta = (rawResults.__workflow ?? {}) as { nodeStates?: Record<string, string> }
  const nodeStates = workflowMeta.nodeStates ?? {}

  for (const [nodeId, gateState] of Object.entries(nodeStates)) {
    if (nodeStatuses[nodeId]) continue
    nodeStatuses[nodeId] = {
      nodeId,
      nodeType: 'unknown',
      status: gateState,
      jobId: '',
      error: null,
    }
  }

  return nodeStatuses
}

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
// This starts one WorkflowEngine run per template instance (same engine as lasso),
// stores workflowJobIds on template job.result, and then aggregates progress
// by reading workflow job statuses from DB.
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

  // Start one workflow per instance using the same engine/path as lasso
  const engine = new WorkflowEngine()
  const workflowJobIds: string[] = []

  for (let i = 0; i < instances.length; i++) {
    const { nodes, edges } = instances[i]
    const startRes = await engine.executeWorkflow(session.user.id, { nodes, edges })
    if (!startRes.success || !startRes.workflowJobId) {
      return NextResponse.json(
        { error: `Failed to start workflow for instance ${instances[i]?.instanceIdx ?? i}` },
        { status: 500 },
      )
    }
    workflowJobIds.push(startRes.workflowJobId)
  }

  // Transition to executing_workflows immediately (with workflow references)
  const initResult: TemplateJobResult = {
    ...existingResult,
    stage:            "executing_workflows",
    workflowProgress: { current: 0, total: instances.length },
    workflowJobIds,
    workflowNodeStatuses: {},
    workflowSummary: {
      queued: instances.length,
      running: 0,
      completed: 0,
      failed: 0,
      total: instances.length,
    },
    instanceResults:  {},
  }
  await prisma.job.update({
    where: { id: jobId },
    data:  { result: initResult as unknown as Prisma.InputJsonValue },
  })

  // Fire-and-forget: aggregate running status until all workflow jobs settle
  void monitorTemplateWorkflows(jobId, workflowJobIds, existingResult)

  return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────
// monitorTemplateWorkflows — runs in the background
// ─────────────────────────────────────────────
async function monitorTemplateWorkflows(
  jobId: string,
  workflowJobIds: string[],
  existingResult: TemplateJobResult,
): Promise<void> {
  const total = workflowJobIds.length

  if (total === 0) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "done",
        result: {
          ...existingResult,
          stage: "done",
          workflowProgress: { current: 0, total: 0 },
          workflowJobIds: [],
          workflowSummary: { queued: 0, running: 0, completed: 0, failed: 0, total: 0 },
          instanceResults: {},
        } as unknown as Prisma.InputJsonValue,
      },
    })
    return
  }

  try {
    const allResults: Record<string, unknown> = {}

    while (true) {
      const workflows = await prisma.workflowJob.findMany({
        where: { id: { in: workflowJobIds } },
        include: {
          jobs: {
            select: {
              id: true,
              nodeId: true,
              nodeType: true,
              status: true,
              error: true,
            },
          },
        },
      })

      const statusById = new Map(workflows.map((wf) => [wf.id, wf]))
      const allNodeStatuses: TemplateWorkflowStatusRecord = {}

      for (const wf of workflows) {
        Object.assign(allNodeStatuses, buildWorkflowNodeStatuses(wf))
      }

      let queued = 0
      let running = 0
      let completed = 0
      let failed = 0

      for (const wfId of workflowJobIds) {
        const wf = statusById.get(wfId)
        const status = wf?.status
        if (!status || status === "pending") {
          queued += 1
          continue
        }
        if (status === "running") {
          running += 1
          continue
        }
        if (status === "completed") {
          completed += 1
          const wfResults = (wf?.results ?? {}) as Record<string, unknown>
          for (const [key, value] of Object.entries(wfResults)) {
            if (key === "__workflow") continue
            allResults[key] = value
          }
          continue
        }
        if (status === "failed") {
          failed += 1
          continue
        }
      }

      const current = completed + failed
      const progResult: TemplateJobResult = {
        ...existingResult,
        stage: "executing_workflows",
        workflowProgress: { current, total },
        workflowJobIds,
        workflowNodeStatuses: allNodeStatuses,
        workflowSummary: { queued, running, completed, failed, total },
        instanceResults: allResults,
      }

      await prisma.job.update({
        where: { id: jobId },
        data: { result: progResult as unknown as Prisma.InputJsonValue },
      })

      if (current >= total) break
      await new Promise((r) => setTimeout(r, 800))
    }

    // All workflows reached terminal states
    const finalWorkflows = await prisma.workflowJob.findMany({
      where: { id: { in: workflowJobIds } },
      include: {
        jobs: {
          select: {
            id: true,
            nodeId: true,
            nodeType: true,
            status: true,
            error: true,
          },
        },
      },
    })
    const finalNodeStatuses: TemplateWorkflowStatusRecord = {}
    for (const wf of finalWorkflows) {
      Object.assign(finalNodeStatuses, buildWorkflowNodeStatuses(wf))
    }

    const doneResult: TemplateJobResult = {
      ...existingResult,
      stage: "done",
      workflowProgress: { current: total, total },
      workflowJobIds,
      workflowNodeStatuses: finalNodeStatuses,
      workflowSummary: {
        queued: 0,
        running: 0,
        completed: finalWorkflows.filter((wf) => wf.status === "completed").length,
        failed: finalWorkflows.filter((wf) => wf.status === "failed").length,
        total,
      },
      instanceResults: allResults,
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "done",
        result: doneResult as unknown as Prisma.InputJsonValue,
      },
    })

  } catch (err: unknown) {
    console.error("[template/continue] monitorTemplateWorkflows failed:", err)
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error:  err instanceof Error ? err.message : "Template workflow execution failed",
      },
    })
  }
}
