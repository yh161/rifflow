import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/messages/[userId] — get messages with a specific user
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const meId = session.user.id
    const { userId: otherId } = await params

    // Fetch messages between the two users
    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: meId, receiverId: otherId },
          { senderId: otherId, receiverId: meId },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        senderId: true,
        content: true,
        read: true,
        isAI: true,
        aiModel: true,
        createdAt: true,
      },
    })

    // Mark unread messages from other user as read
    await prisma.directMessage.updateMany({
      where: { senderId: otherId, receiverId: meId, read: false },
      data: { read: true },
    })

    // Get other user's info
    const contact = await prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, name: true, image: true },
    })

    return NextResponse.json({
      contact,
      messages: messages.map((m) => ({
        ...m,
        // AI messages are never "mine" — they belong to the AI
        isMe: !m.isAI && m.senderId === meId,
      })),
    })
  } catch (error) {
    console.error("[messages/userId GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/messages/[userId] — send a message
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { content } = await req.json()
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Message content required" }, { status: 400 })
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 })
    }

    const { userId: receiverId } = await params
    if (session.user.id === receiverId) {
      return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 })
    }

    // Verify receiver exists
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    })
    if (!receiver) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check mutual follow
    const [iFollow, theyFollow] = await Promise.all([
      prisma.follow.findUnique({ where: { followerId_followingId: { followerId: session.user.id, followingId: receiverId } } }),
      prisma.follow.findUnique({ where: { followerId_followingId: { followerId: receiverId, followingId: session.user.id } } }),
    ])
    const isMutual = !!iFollow && !!theyFollow

    if (!isMutual) {
      // Allow only 1 message from sender to this receiver
      const sentCount = await prisma.directMessage.count({
        where: { senderId: session.user.id, receiverId },
      })
      if (sentCount >= 1) {
        return NextResponse.json({ error: "STRANGER_LIMIT", message: "Only 1 message allowed to non-mutual followers. Follow each other to continue chatting." }, { status: 403 })
      }
    }

    const message = await prisma.directMessage.create({
      data: {
        senderId: session.user.id,
        receiverId,
        content: content.trim(),
      },
      select: {
        id: true,
        senderId: true,
        content: true,
        read: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ message: { ...message, isMe: true } })
  } catch (error) {
    console.error("[messages/userId POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
