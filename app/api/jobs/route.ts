import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { JobService } from "@/app/services/job.service"
import type { MultimodalContent } from "@/lib/prompt-resolver"

// ─────────────────────────────────────────────
// POST /api/jobs
// Body: { nodeId, nodeType, prompt?, content?, model }
//   - prompt: string (legacy, for backward compatibility)
//   - content: MultimodalContent[] (new format, preferred)
// Returns: { jobId }
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { nodeId, nodeType, prompt, content, model } = await req.json()

    // Support both legacy string prompt and new multimodal content format
    const hasContent = content && Array.isArray(content) && content.length > 0
    const hasPrompt = prompt && (typeof prompt === "string" ? prompt.trim().length > 0 : true)
    
    if (!hasContent && !hasPrompt) {
      return NextResponse.json({ error: "Prompt or content is required" }, { status: 400 })
    }

    // Normalize content to MultimodalContent[] format
    let normalizedContent: MultimodalContent[]
    if (hasContent) {
      normalizedContent = content as MultimodalContent[]
    } else if (typeof prompt === "string") {
      normalizedContent = [{ type: "text", text: prompt }]
    } else {
      normalizedContent = prompt as MultimodalContent[]
    }

    const jobService = new JobService()
    const result = await jobService.createJob({
      userId: session.user.id,
      nodeId,
      nodeType,
      content: normalizedContent,
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
        content: normalizedContent,
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
