import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/rooms/direct — find or create a 1v1 direct room with another user
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { targetUserId } = await req.json()

    if (!targetUserId || typeof targetUserId !== "string") {
      return NextResponse.json({ error: "targetUserId required" }, { status: 400 })
    }
    if (targetUserId === meId) {
      return NextResponse.json({ error: "Cannot create a direct room with yourself" }, { status: 400 })
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, image: true },
    })
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Find existing direct room that contains both users
    const existing = await prisma.chatRoom.findFirst({
      where: {
        isDirect: true,
        AND: [
          { members: { some: { userId: meId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
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
    })

    if (existing) {
      const myMembership = existing.members.find((m) => m.userId === meId)
      const last = existing.messages[0] ?? null
      const unreadCount = await prisma.chatMessage.count({
        where: {
          roomId: existing.id,
          createdAt: { gt: myMembership?.lastReadAt ?? new Date(0) },
          NOT: { senderId: meId },
        },
      })
      return NextResponse.json({
        room: {
          id: existing.id,
          name: existing.name,
          ownerId: existing.ownerId,
          isDirect: true,
          joinPermission: existing.joinPermission,
          updatedAt: existing.updatedAt,
          members: existing.members.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            image: m.user.image,
            role: m.role,
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
          myRole: myMembership?.role ?? "member",
        },
        created: false,
      })
    }

    // Create new direct room (no owner, both are plain members)
    const room = await prisma.chatRoom.create({
      data: {
        isDirect: true,
        ownerId: null,
        members: {
          create: [
            { userId: meId, role: "member" },
            { userId: targetUserId, role: "member" },
          ],
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
        ownerId: null,
        isDirect: true,
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
        myRole: "member",
      },
      created: true,
    })
  } catch (error) {
    console.error("[POST /api/rooms/direct]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
