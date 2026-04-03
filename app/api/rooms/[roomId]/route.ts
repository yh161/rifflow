import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = Promise<{ roomId: string }>

// GET /api/rooms/[roomId] — room metadata + messages
export async function GET(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params

    // Check membership
    const membership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: meId } },
    })
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, image: true } } },
          orderBy: { joinedAt: "asc" },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
          include: { sender: { select: { id: true, name: true, image: true } } },
        },
      },
    })

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    // Update lastReadAt
    await prisma.chatMember.update({
      where: { roomId_userId: { roomId, userId: meId } },
      data: { lastReadAt: new Date() },
    })

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        updatedAt: room.updatedAt,
        members: room.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          image: m.user.image,
          role: m.role,
        })),
        messages: room.messages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          createdAt: msg.createdAt,
          isMe: msg.senderId === meId,
          isAI: msg.isAI,
          aiModel: msg.aiModel,
          senderId: msg.senderId,
          senderName: msg.sender?.name ?? null,
          senderImage: msg.sender?.image ?? null,
        })),
      },
    })
  } catch (error) {
    console.error("[GET /api/rooms/[roomId]]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/rooms/[roomId] — rename room
export async function PATCH(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params
    const { name } = await req.json()

    const membership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: meId } },
    })
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    const updated = await prisma.chatRoom.update({
      where: { id: roomId },
      data: { name: name?.trim() || null },
    })

    return NextResponse.json({ name: updated.name })
  } catch (error) {
    console.error("[PATCH /api/rooms/[roomId]]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
