import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { RiffDraftSnapshotRepository } from "@/app/repositories/riffDraftSnapshot.repository"
import { RiffDraftRepository } from "@/app/repositories/riffDraft.repository"

// ─────────────────────────────────────────────
// POST /api/draft/undo  — 撤回到上一个快照
// ─────────────────────────────────────────────
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const snapshotRepo = new RiffDraftSnapshotRepository()
  const draftRepo    = new RiffDraftRepository()

  const previous = await snapshotRepo.popAndGetPrevious(session.user.id)
  if (!previous) {
    return NextResponse.json({ error: "Nothing to undo" }, { status: 404 })
  }

  // Restore the previous snapshot into RiffDraft
  await draftRepo.upsertByUserId(session.user.id, {
    user:         { connect: { id: session.user.id } },
    nodesJson:    previous.nodesJson as any,
    edgesJson:    previous.edgesJson as any,
    viewportJson: previous.viewportJson as any,
  })

  const [undoCount, redoCount] = await Promise.all([
    snapshotRepo.count(session.user.id),
    snapshotRepo.countRedo(session.user.id),
  ])

  return NextResponse.json({
    ok: true,
    nodesJson:    previous.nodesJson,
    edgesJson:    previous.edgesJson,
    viewportJson: previous.viewportJson,
    undoCount,
    redoCount,
  })
}
