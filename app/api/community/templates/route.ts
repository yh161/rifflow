import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { templateRepository } from "@/app/repositories/template.repository"
import { favoriteRepository } from "@/app/repositories/community.repository"

// GET /api/community/templates
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const session = await getServerSession(authOptions)

    const creatorId = searchParams.get("creatorId") ?? undefined
    const status    = searchParams.get("status")    ?? undefined

    // 草稿和已下架内容只能由创作者本人查询
    if (status === "draft" || status === "unpublished") {
      if (!session?.user?.id || session.user.id !== creatorId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const filter = {
      category:    searchParams.get("category")    ?? undefined,
      pricingType: searchParams.get("pricingType") ?? undefined,
      search:      searchParams.get("search")      ?? undefined,
      orderBy:     (searchParams.get("orderBy") ?? "newest") as "newest" | "popular" | "rating",
      limit:       Number(searchParams.get("limit")  ?? 20),
      offset:      Number(searchParams.get("offset") ?? 0),
      creatorId,
      status,
    }

    const templates = await templateRepository.list(filter)

    let favoritedIds = new Set<string>()
    if (session?.user?.id) {
      const ids = templates.map((t) => t.id)
      favoritedIds = await favoriteRepository.checkBatch(session.user.id, ids)
    }

    const result = templates.map((t) => ({
      ...t,
      rating:      Number(t.rating),
      isFavorited: favoritedIds.has(t.id),
    }))

    return NextResponse.json({ templates: result, total: result.length })
  } catch (error) {
    console.error("[community/templates GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/community/templates — 创作者发布模板
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const {
      name, description, thumbnail, category = "general",
      tags = [], parameters = [], pricingType = "free",
      priceInPoints, canvasSnapshot, publish = false,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    if (!canvasSnapshot) {
      return NextResponse.json({ error: "Canvas snapshot is required" }, { status: 400 })
    }

    const template = await templateRepository.create({
      name: name.trim(),
      description,
      thumbnail,
      category,
      tags,
      parameters,
      pricingType,
      priceInPoints: pricingType === "pay_per_use" ? (Number(priceInPoints) || 10) : undefined,
      canvasSnapshot,
      status: publish ? "published" : "draft",
      publishedAt: publish ? new Date() : undefined,
      creator: { connect: { id: session.user.id } },
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error("[community/templates POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
