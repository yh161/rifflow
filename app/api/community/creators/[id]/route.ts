import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { templateRepository } from "@/app/repositories/template.repository"
import { subscriptionPlanRepository } from "@/app/repositories/community.repository"

// GET /api/community/creators/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const creator = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, image: true,
        isCreator: true, creatorBio: true, createdAt: true,
        _count: { select: { createdTemplates: true } },
      },
    })

    if (!creator || !creator.isCreator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const [templates, plans] = await Promise.all([
      templateRepository.byCreator(id),
      subscriptionPlanRepository.byCreator(id),
    ])

    return NextResponse.json({
      creator: {
        ...creator,
        templatesCount: creator._count.createdTemplates,
      },
      templates,
      plans,
    })
  } catch (error) {
    console.error("[creators/[id] GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
