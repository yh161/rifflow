import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { templateRepository } from "@/app/repositories/template.repository"

// GET /api/community/templates/[id]/snapshot
// Returns the canvasSnapshot (nodes + edges) for the owner of an unpublished template.
// Restricted to the authenticated creator only.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const template = await templateRepository.findById(id)
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    // Published templates: any authenticated user can copy the snapshot
    // Unpublished drafts: creator only
    const isPublished = template.status === "published"
    if (!isPublished && template.creatorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const snapshot = template.canvasSnapshot as { nodes?: unknown[]; edges?: unknown[] } | null
    return NextResponse.json({
      nodes: snapshot?.nodes ?? [],
      edges: snapshot?.edges ?? [],
    })
  } catch (error) {
    console.error("[community/templates/[id]/snapshot GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
