import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { RiffDraftSnapshotRepository } from "@/app/repositories/riffDraftSnapshot.repository"
import { RiffDraftRepository } from "@/app/repositories/riffDraft.repository"
import { normalizeDraftNodes } from "@/lib/draft-assets"
import { Prisma } from "@prisma/client"

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

  const normalizedNodes = normalizeDraftNodes(
    Array.isArray(previous.nodesJson) ? previous.nodesJson : [],
    { stripEphemeral: false, stripRuntimeFields: false },
  )

  // Restore the previous snapshot into RiffDraft
  await draftRepo.upsertByUserId(session.user.id, {
    user:         { connect: { id: session.user.id } },
    nodesJson:    normalizedNodes as Prisma.InputJsonValue,
    edgesJson:    previous.edgesJson as Prisma.InputJsonValue,
    viewportJson: previous.viewportJson as Prisma.InputJsonValue,
  })

  const [undoCount, redoCount] = await Promise.all([
    snapshotRepo.count(session.user.id),
    snapshotRepo.countRedo(session.user.id),
  ])

  return NextResponse.json({
    ok: true,
    nodesJson:    normalizedNodes,
    edgesJson:    previous.edgesJson,
    viewportJson: previous.viewportJson,
    undoCount,
    redoCount,
  })
}
