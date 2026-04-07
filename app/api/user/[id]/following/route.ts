import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/user/[id]/following
// Returns the list of users that [id] is following.
// Each entry includes whether the current session user is following them.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const currentUserId = session?.user?.id ?? null
    const { id } = await params

    // Verify target user exists
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true } })
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get all users that [id] is following
    const follows = await prisma.follow.findMany({
      where: { followerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        following: {
          select: { id: true, name: true, image: true, isCreator: true },
        },
      },
    })

    const followingIds = follows.map((f) => f.following.id)

    // Check which of those users the current user is following
    let currentlyFollowingSet: Set<string> = new Set()
    if (currentUserId && followingIds.length > 0) {
      const myFollows = await prisma.follow.findMany({
        where: { followerId: currentUserId, followingId: { in: followingIds } },
        select: { followingId: true },
      })
      currentlyFollowingSet = new Set(myFollows.map((f) => f.followingId))
    }

    const users = follows.map((f) => ({
      id: f.following.id,
      name: f.following.name,
      image: f.following.image,
      isCreator: f.following.isCreator,
      isFollowing: currentlyFollowingSet.has(f.following.id),
      isMe: f.following.id === currentUserId,
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error("[user/following GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
