import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const currentUserId = session?.user?.id ?? null
    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        image: true,
        isCreator: true,
        creatorBio: true,
        createdAt: true,
        _count: {
          select: {
            followers: true,
            following: true,
            createdTemplates: { where: { status: "published" } },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check follow relationships between current user and profile user
    let isFollowing = false // current user → profile user
    let followsMe = false   // profile user → current user
    let isMutual = false    // both follow each other
    if (currentUserId && currentUserId !== id) {
      const [follow, reverseFollow] = await Promise.all([
        prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: currentUserId, followingId: id } },
        }),
        prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: id, followingId: currentUserId } },
        }),
      ])
      isFollowing = !!follow
      followsMe = !!reverseFollow
      isMutual = isFollowing && followsMe
    }

    // Get published templates
    const templates = await prisma.template.findMany({
      where: { creatorId: id, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 30,
      select: {
        id: true,
        name: true,
        description: true,
        thumbnail: true,
        category: true,
        tags: true,
        pricingType: true,
        priceInPoints: true,
        executionsCount: true,
        favoritesCount: true,
        rating: true,
        isFeatured: true,
        publishedAt: true,
        creatorId: true,
      },
    })

    // Check which templates are favorited by current user
    let favoritedIds: Set<string> = new Set()
    if (currentUserId) {
      const favs = await prisma.userFavorite.findMany({
        where: { userId: currentUserId, templateId: { in: templates.map((t) => t.id) } },
        select: { templateId: true },
      })
      favoritedIds = new Set(favs.map((f) => f.templateId))
    }

    const templateSummaries = templates.map((t) => ({
      ...t,
      rating: Number(t.rating),
      isFavorited: favoritedIds.has(t.id),
      creator: { id: user.id, name: user.name, image: user.image },
    }))

    return NextResponse.json({
      profile: {
        id: user.id,
        name: user.name,
        image: user.image,
        isCreator: user.isCreator,
        bio: user.creatorBio,
        createdAt: user.createdAt,
        followersCount: user._count.followers,
        followingCount: user._count.following,
        publishedCount: user._count.createdTemplates,
        isFollowing,
        followsMe,
        isMutual,
        isMe: currentUserId === id,
      },
      templates: templateSummaries,
    })
  } catch (error) {
    console.error("[user/profile GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
