import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobService } from "@/app/services/job.service"

// ─────────────────────────────────────────────
// POST /api/jobs
// Body: { nodeId, nodeType, prompt, model }
// Returns: { jobId }
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { nodeId, nodeType, prompt, model } = await req.json()

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const jobService = new JobService()
    const result = await jobService.createJob({
      userId: session.user.id,
      nodeId,
      nodeType,
      prompt,
      model
    })

    if (!result.success) {
      if (result.error === "Insufficient credits") {
        return NextResponse.json({ error: result.error }, { status: 402 })
      }
      return NextResponse.json({ error: result.error || "Failed to create job" }, { status: 500 })
    }

    // Fire-and-forget execution
    if (result.jobId) {
      void jobService.executeJob(result.jobId, {
        userId: session.user.id,
        nodeType,
        prompt,
        model
      })
    }

    return NextResponse.json({ jobId: result.jobId })

  } catch (error: unknown) {
    console.error("[jobs] unhandled:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" }, 
      { status: 500 }
    )
  }
}