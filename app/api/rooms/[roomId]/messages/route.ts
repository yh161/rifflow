import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = Promise<{ roomId: string }>

// POST /api/rooms/[roomId]/messages — send a message
export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params
    const { content } = await req.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content required" }, { status: 400 })
    }

    const membership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: meId } },
    })
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: { roomId, senderId: meId, content: content.trim() },
        include: { sender: { select: { id: true, name: true, image: true } } },
      }),
      prisma.chatRoom.update({
        where: { id: roomId },
        data: { updatedAt: new Date() },
      }),
    ])

    return NextResponse.json({
      message: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        isMe: true,
        isAI: false,
        senderId: meId,
        senderName: message.sender?.name ?? null,
        senderImage: message.sender?.image ?? null,
      },
    })
  } catch (error) {
    console.error("[POST /api/rooms/[roomId]/messages]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
