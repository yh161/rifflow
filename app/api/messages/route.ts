import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/messages — list conversations (latest message per contact)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    // Get all messages involving this user, grouped by the other party
    const messages = await prisma.directMessage.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        content: true,
        read: true,
        createdAt: true,
        sender: { select: { id: true, name: true, image: true } },
        receiver: { select: { id: true, name: true, image: true } },
      },
    })

    // Group by other user, keep only latest message per conversation
    const convMap = new Map<string, typeof messages[0]>()
    for (const msg of messages) {
      const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId
      if (!convMap.has(otherId)) {
        convMap.set(otherId, msg)
      }
    }

    // Collect all contact IDs to check mutual follow in bulk
    const contactIds = Array.from(convMap.keys())

    // Fetch follow relationships involving me and all contacts
    const follows = await prisma.follow.findMany({
      where: {
        OR: [
          { followerId: userId, followingId: { in: contactIds } },
          { followerId: { in: contactIds }, followingId: userId },
        ],
      },
      select: { followerId: true, followingId: true },
    })

    const iFollowSet = new Set(follows.filter(f => f.followerId === userId).map(f => f.followingId))
    const theyFollowSet = new Set(follows.filter(f => f.followingId === userId).map(f => f.followerId))

    // Count unread per conversation
    const conversations = Array.from(convMap.entries()).map(([otherId, msg]) => {
      const other = msg.senderId === userId ? msg.receiver : msg.sender
      const unreadCount = messages.filter(
        (m) => m.senderId === otherId && m.receiverId === userId && !m.read
      ).length
      const isMutual = iFollowSet.has(otherId) && theyFollowSet.has(otherId)
      return {
        contactId: otherId,
        contact: other,
        lastMessage: { content: msg.content, createdAt: msg.createdAt, isMe: msg.senderId === userId },
        unreadCount,
        isMutual,
      }
    })

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error("[messages GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
