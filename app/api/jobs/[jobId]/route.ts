import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// ─────────────────────────────────────────────
// GET /api/jobs/[jobId]
// Returns: { status, result?, error?, createdAt }
// ─────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { jobId } = await params

  const job = await prisma.job.findUnique({
    where:  { id: jobId },
  })

  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobWithOutput = job as typeof job & { outputData?: unknown }

  return NextResponse.json({
    status:    job.status,
    result:    jobWithOutput.outputData ?? job.result,
    error:     job.error,
    createdAt: job.createdAt,
  })
}