import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DraftService } from "@/app/services/draft.service"
import { RiffDraftSnapshotRepository } from "@/app/repositories/riffDraftSnapshot.repository"
import { NextResponse } from "next/server"

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 }

function emptyDraftPayload() {
  return {
    nodesJson:    [],
    edgesJson:    [],
    viewportJson: DEFAULT_VIEWPORT,
    favorites:    [],
    undoCount:    0,
    redoCount:    0,
  }
}

// ─────────────────────────────────────────────
// GET /api/draft  — 加载当前用户的草稿
// ─────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const draftService = new DraftService()
  const result = await draftService.getDraftByUserId(session.user.id)

  if (!result.success) {
    // Do not hard-fail canvas bootstrap on draft read issues.
    // Return an empty draft so editor can still open.
    console.error("[api/draft][GET] load failed, fallback to empty draft:", result.error)
    return NextResponse.json(emptyDraftPayload())
  }

  const data = result.data ?? { nodes: [], edges: [], viewport: DEFAULT_VIEWPORT }
  let undoCount = 0
  let redoCount = 0
  try {
    const snapshotRepo = new RiffDraftSnapshotRepository()
    ;[undoCount, redoCount] = await Promise.all([
      snapshotRepo.count(session.user.id),
      snapshotRepo.countRedo(session.user.id),
    ])
  } catch (error) {
    // Snapshot table may be unavailable/migration-lagged; non-fatal for canvas.
    console.error("[api/draft][GET] snapshot count failed, fallback to 0:", error)
  }

  return NextResponse.json({
    nodesJson:    data.nodes,
    edgesJson:    data.edges,
    viewportJson: data.viewport,
    favorites:    (data as { favorites?: unknown[] }).favorites ?? [],
    undoCount,
    redoCount,
  })
}

// ─────────────────────────────────────────────
// POST /api/draft  — 保存（upsert）当前用户的草稿
// Body: { nodes: Node[], edges: Edge[], viewport: { x, y, zoom } }
// ─────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { nodes: unknown; edges: unknown; viewport: unknown; favorites?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const nodes = Array.isArray(body.nodes) ? body.nodes : []
  const edges = Array.isArray(body.edges) ? body.edges : []
  const favorites = Array.isArray(body.favorites)
    ? body.favorites.filter((x): x is string => typeof x === "string")
    : []

  // Validate viewport shape; fall back to default if malformed
  const vp = body.viewport as Record<string, unknown> | null
  const viewport =
    vp && typeof vp.x === "number" && typeof vp.y === "number" && typeof vp.zoom === "number"
      ? { x: vp.x, y: vp.y, zoom: vp.zoom }
      : DEFAULT_VIEWPORT

  const draftService = new DraftService()
  const result = await draftService.saveDraft(session.user.id, nodes, edges, viewport, favorites)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to save draft" },
      { status: 500 }
    )
  }

  // Push history snapshot (throttled — at most once per 5 s, max 40 snapshots)
  // Fire-and-forget: snapshot failure should never block the autosave response
  const snapshotRepo = new RiffDraftSnapshotRepository()
  snapshotRepo.pushIfThrottled(session.user.id, nodes, edges, { ...viewport, favorites }).catch(() => {})

  return NextResponse.json({ ok: true })
}
