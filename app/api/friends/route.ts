import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/friends — return current user's mutual followers (both follow each other)
// Used by the sidebar friend picker when adding people to rooms / creating groups.
//
// Extensible: future invite methods (QR code, group ID, username search) can be
// added as separate endpoints or query params without changing this contract.
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id

    // Find everyone I follow
    const iFollow = await prisma.follow.findMany({
      where: { followerId: meId },
      select: { followingId: true },
    })
    const iFollowIds = iFollow.map((f) => f.followingId)

    if (iFollowIds.length === 0) {
      return NextResponse.json({ friends: [] })
    }

    // Among those, find who also follows me back (mutual)
    const mutual = await prisma.follow.findMany({
      where: {
        followerId: { in: iFollowIds },
        followingId: meId,
      },
      select: { followerId: true },
    })
    const mutualIds = mutual.map((f) => f.followerId)

    if (mutualIds.length === 0) {
      return NextResponse.json({ friends: [] })
    }

    const users = await prisma.user.findMany({
      where: { id: { in: mutualIds } },
      select: { id: true, name: true, image: true },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({ friends: users })
  } catch (error) {
    console.error("[GET /api/friends]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
