import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { templateRepository } from "@/app/repositories/template.repository"
import { favoriteRepository } from "@/app/repositories/community.repository"

// GET /api/community/templates/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    const template = await templateRepository.findByIdSafe(id)

    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    let isFavorited = false
    if (session?.user?.id) {
      isFavorited = await favoriteRepository.isFavorite(session.user.id, id)
    }

    return NextResponse.json({
      template: {
        ...template,
        pricePerUse: template.pricePerUse ? Number(template.pricePerUse) : null,
        rating:      Number(template.rating),
        isFavorited,
      },
    })
  } catch (error) {
    console.error("[community/templates/[id] GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/community/templates/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await templateRepository.findById(id)
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (existing.creatorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const updated = await templateRepository.update(id, body)
    return NextResponse.json({ template: updated })
  } catch (error) {
    console.error("[community/templates/[id] PATCH]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
