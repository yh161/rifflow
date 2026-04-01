import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: followingId } = await params
    const followerId = session.user.id

    if (followerId === followingId) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 })
    }

    // Check if target user exists
    const target = await prisma.user.findUnique({ where: { id: followingId }, select: { id: true } })
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Toggle follow
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    })

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } })
      return NextResponse.json({ action: "unfollowed" })
    } else {
      await prisma.follow.create({ data: { followerId, followingId } })
      return NextResponse.json({ action: "followed" })
    }
  } catch (error) {
    console.error("[user/follow POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
