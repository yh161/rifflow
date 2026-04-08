import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/rooms — list all rooms for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id

    const memberships = await prisma.chatMember.findMany({
      where: { userId: meId },
      include: {
        room: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true, image: true } } },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { sender: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { room: { updatedAt: "desc" } },
    })

    const rooms = await Promise.all(
      memberships.map(async (m) => {
        const last = m.room.messages[0] ?? null
        const unreadCount = await prisma.chatMessage.count({
          where: {
            roomId: m.room.id,
            createdAt: { gt: m.lastReadAt },
            NOT: { senderId: meId },
          },
        })

        // isRequest: true if this is a direct room where I haven't replied yet
        // and the other person is not a mutual follower.
        // Used to show "Message Requests" section in the sidebar.
        let isRequest = false
        if (m.room.isDirect) {
          const otherMember = m.room.members.find((mb) => mb.userId !== meId)
          if (otherMember) {
            const otherId = otherMember.userId
            const [iFollowCount, theyFollowCount, mySentCount] = await Promise.all([
              prisma.follow.count({ where: { followerId: meId, followingId: otherId } }),
              prisma.follow.count({ where: { followerId: otherId, followingId: meId } }),
              prisma.chatMessage.count({ where: { roomId: m.room.id, senderId: meId } }),
            ])
            const isMutual = iFollowCount > 0 && theyFollowCount > 0
            isRequest = !isMutual && mySentCount === 0
          }
        }

        return {
          id: m.room.id,
          name: m.room.name,
          ownerId: m.room.ownerId,
          isDirect: m.room.isDirect,
          isRequest,
          joinPermission: m.room.joinPermission,
          updatedAt: m.room.updatedAt,
          members: m.room.members.map((mb) => ({
            id: mb.user.id,
            name: mb.user.name,
            image: mb.user.image,
            role: mb.role,
          })),
          lastMessage: last
            ? {
                content: last.content,
                createdAt: last.createdAt,
                isMe: last.senderId === meId,
                isAI: last.isAI,
                senderName: last.sender?.name ?? null,
              }
            : null,
          unreadCount,
          myRole: m.role,
        }
      })
    )

    return NextResponse.json({ rooms })
  } catch (error) {
    console.error("[GET /api/rooms]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/rooms — create a new room
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id

    const { name, memberIds = [] } = await req.json()

    // Always include creator; deduplicate
    const allIds: string[] = Array.from(new Set([meId, ...memberIds]))

    const room = await prisma.chatRoom.create({
      data: {
        name: name?.trim() || null,
        ownerId: meId,
        members: {
          create: allIds.map((uid: string) => ({
            userId: uid,
            role: uid === meId ? "owner" : "member",
          })),
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    })

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        isDirect: false,
        joinPermission: room.joinPermission,
        updatedAt: room.updatedAt,
        members: room.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          image: m.user.image,
          role: m.role,
        })),
        lastMessage: null,
        unreadCount: 0,
        myRole: "owner",
      },
    })
  } catch (error) {
    console.error("[POST /api/rooms]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
