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
        rating:      Number(template.rating),
        isFavorited,
      },
    })
  } catch (error) {
    console.error("[community/templates/[id] GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/community/templates/[id]
export async function DELETE(
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

    await templateRepository.delete(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[community/templates/[id] DELETE]", error)
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

    // Whitelist only valid Template fields — discard any unknown keys like `publish`
    const allowed = [
      "name", "description", "thumbnail", "category", "tags", "parameters",
      "pricingType", "priceInPoints", "canvasSnapshot", "status", "publishedAt",
      "isFeatured", "executionsCount", "favoritesCount", "rating",
      "visibility", "visibilityList",
    ]
    const updateData: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) {
        // publishedAt: convert ISO string → Date for Prisma, or null
        if (key === "publishedAt") {
          updateData[key] = body[key] !== null ? new Date(body[key]) : null
        } else {
          updateData[key] = body[key]
        }
      }
    }

    const updated = await templateRepository.update(id, updateData)
    return NextResponse.json({ template: updated })
  } catch (error) {
    console.error("[community/templates/[id] PATCH]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
