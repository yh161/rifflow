import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = Promise<{ roomId: string }>

// POST /api/rooms/[roomId]/members — add a member by userId
export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params
    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 })
    }

    // Must be a member yourself
    const myMembership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: meId } },
    })
    if (!myMembership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, image: true },
    })
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Upsert member (safe if already in room)
    await prisma.chatMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: {},
      create: { roomId, userId, role: "member" },
    })

    return NextResponse.json({
      member: { id: targetUser.id, name: targetUser.name, image: targetUser.image, role: "member" },
    })
  } catch (error) {
    console.error("[POST /api/rooms/[roomId]/members]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/rooms/[roomId]/members — remove self from room
export async function DELETE(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params

    await prisma.chatMember.delete({
      where: { roomId_userId: { roomId, userId: meId } },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/rooms/[roomId]/members]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
