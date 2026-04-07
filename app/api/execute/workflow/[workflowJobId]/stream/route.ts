import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { WorkflowEngine } from "@/app/services/workflow.service"
import { prisma } from "@/lib/prisma"

type Params = { params: Promise<{ workflowJobId: string }> }

const TERMINAL_STATUSES = new Set(["completed", "failed", "stopped"])
const STREAM_POLL_MS = 200

/**
 * GET /api/execute/workflow/[workflowJobId]/stream
 * Server-Sent Events stream for real-time workflow status.
 *
 * Pushes WorkflowStatus objects as `data: {...}\n\n` until terminal state.
 * Used by:
 *   - Lasso action bar (live progress)
 *   - Console (replaces polling, drives fitView and task list)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { workflowJobId } = await params

  // Verify ownership
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return new Response("User not found", { status: 404 })

  const wf = await prisma.workflowJob.findUnique({ where: { id: workflowJobId } })
  if (!wf || wf.userId !== user.id) {
    return new Response("Not found", { status: 404 })
  }

  const engine = new WorkflowEngine()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Client disconnected
        }
      }

      // Send a heartbeat comment every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"))
        } catch {
          clearInterval(heartbeat)
        }
      }, 15_000)

      try {
        while (true) {
          const status = await engine.getWorkflowStatus(workflowJobId)
          if (!status) break

          send(status)

          if (TERMINAL_STATUSES.has(status.status)) break

          // Check for abort (client disconnected)
          if (req.signal.aborted) break

          await new Promise((r) => setTimeout(r, STREAM_POLL_MS))
        }
      } catch (err) {
        console.error("[workflow/stream] error:", err)
      } finally {
        clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      }
    },
    cancel() {
      // Client disconnected — ReadableStream cancel is called automatically
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Nginx: disable buffering for SSE
    },
  })
}
