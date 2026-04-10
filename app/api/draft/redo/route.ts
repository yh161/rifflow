import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { RiffDraftSnapshotRepository } from "@/app/repositories/riffDraftSnapshot.repository"
import { RiffDraftRepository } from "@/app/repositories/riffDraft.repository"
import { normalizeDraftNodes } from "@/lib/draft-assets"
import { Prisma } from "@prisma/client"

// ─────────────────────────────────────────────
// POST /api/draft/redo  — 重做到下一个快照
// ─────────────────────────────────────────────
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const snapshotRepo = new RiffDraftSnapshotRepository()
  const draftRepo    = new RiffDraftRepository()

  const next = await snapshotRepo.popFromRedoStack(session.user.id)
  if (!next) {
    return NextResponse.json({ error: "Nothing to redo" }, { status: 404 })
  }

  const normalizedNodes = normalizeDraftNodes(
    Array.isArray(next.nodesJson) ? next.nodesJson : [],
    { stripEphemeral: false, stripRuntimeFields: false },
  )

  // Restore the redo snapshot into RiffDraft
  await draftRepo.upsertByUserId(session.user.id, {
    user:         { connect: { id: session.user.id } },
    nodesJson:    normalizedNodes as Prisma.InputJsonValue,
    edgesJson:    next.edgesJson as Prisma.InputJsonValue,
    viewportJson: next.viewportJson as Prisma.InputJsonValue,
  })

  const [undoCount, redoCount] = await Promise.all([
    snapshotRepo.count(session.user.id),
    snapshotRepo.countRedo(session.user.id),
  ])

  return NextResponse.json({
    ok: true,
    nodesJson:    normalizedNodes,
    edgesJson:    next.edgesJson,
    viewportJson: next.viewportJson,
    undoCount,
    redoCount,
  })
}
