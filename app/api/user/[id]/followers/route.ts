import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/user/[id]/followers
// Returns the list of users who follow [id].
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

    // Get all followers (users who follow [id])
    const follows = await prisma.follow.findMany({
      where: { followingId: id },
      orderBy: { createdAt: "desc" },
      select: {
        follower: {
          select: { id: true, name: true, image: true, isCreator: true },
        },
      },
    })

    const followerIds = follows.map((f) => f.follower.id)

    // Check which of those users the current user is following
    let currentlyFollowingSet: Set<string> = new Set()
    if (currentUserId && followerIds.length > 0) {
      const myFollows = await prisma.follow.findMany({
        where: { followerId: currentUserId, followingId: { in: followerIds } },
        select: { followingId: true },
      })
      currentlyFollowingSet = new Set(myFollows.map((f) => f.followingId))
    }

    const users = follows.map((f) => ({
      id: f.follower.id,
      name: f.follower.name,
      image: f.follower.image,
      isCreator: f.follower.isCreator,
      isFollowing: currentlyFollowingSet.has(f.follower.id),
      isMe: f.follower.id === currentUserId,
    }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error("[user/followers GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
