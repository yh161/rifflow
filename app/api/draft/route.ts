import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { DraftService } from "@/app/services/draft.service"
import { NextResponse } from "next/server"

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

  // Return data in the format Canvas expects: { nodesJson, edgesJson }
  const data = result.data ?? { nodes: [], edges: [] }
  return NextResponse.json({ 
    nodesJson: data.nodes, 
    edgesJson: data.edges 
  })
}

// ─────────────────────────────────────────────
// POST /api/draft  — 保存（upsert）当前用户的草稿
// Body: { nodes: Node[], edges: Edge[] }
// ─────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { nodes: unknown; edges: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const nodes = Array.isArray(body.nodes) ? body.nodes : []
  const edges = Array.isArray(body.edges) ? body.edges : []

  const draftService = new DraftService()
  const result = await draftService.saveDraft(session.user.id, nodes, edges)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to save draft" }, 
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}