import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DraftService } from "@/app/services/draft.service"
import { NextResponse } from "next/server"

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 }

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
    return NextResponse.json(
      { error: result.error || "Failed to load draft" },
      { status: 500 }
    )
  }

  const data = result.data ?? { nodes: [], edges: [], viewport: DEFAULT_VIEWPORT }
  return NextResponse.json({
    nodesJson:    data.nodes,
    edgesJson:    data.edges,
    viewportJson: data.viewport,
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

  let body: { nodes: unknown; edges: unknown; viewport: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const nodes = Array.isArray(body.nodes) ? body.nodes : []
  const edges = Array.isArray(body.edges) ? body.edges : []

  // Validate viewport shape; fall back to default if malformed
  const vp = body.viewport as Record<string, unknown> | null
  const viewport =
    vp && typeof vp.x === "number" && typeof vp.y === "number" && typeof vp.zoom === "number"
      ? { x: vp.x, y: vp.y, zoom: vp.zoom }
      : DEFAULT_VIEWPORT

  const draftService = new DraftService()
  const result = await draftService.saveDraft(session.user.id, nodes, edges, viewport)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to save draft" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
