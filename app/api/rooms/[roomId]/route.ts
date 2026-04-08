import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = Promise<{ roomId: string }>

const PAGE_SIZE = 50

// GET /api/rooms/[roomId]?before=<msgId>&limit=50 — room metadata + paginated messages
export async function GET(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params
    const url = new URL(req.url)
    const before = url.searchParams.get("before") ?? null
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? String(PAGE_SIZE), 10), 100)

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
      },
    })

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    // Paginated messages — if `before` provided, fetch messages before that ID
    let cursorFilter = {}
    if (before) {
      const cursorMsg = await prisma.chatMessage.findUnique({ where: { id: before } })
      if (cursorMsg) {
        cursorFilter = { createdAt: { lt: cursorMsg.createdAt } }
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where: { roomId, ...cursorFilter },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // fetch one extra to detect hasMore
      include: { sender: { select: { id: true, name: true, image: true } } },
    })

    const hasMore = messages.length > limit
    const pageMessages = messages.slice(0, limit).reverse() // ascending for display

    // Update lastReadAt (only when loading initial page, not pagination)
    if (!before) {
      await prisma.chatMember.update({
        where: { roomId_userId: { roomId, userId: meId } },
        data: { lastReadAt: new Date() },
      })
    }

    return NextResponse.json({
      room: {
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        isDirect: room.isDirect,
        joinPermission: room.joinPermission,
        updatedAt: room.updatedAt,
        members: room.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          image: m.user.image,
          role: m.role,
        })),
        myRole: membership.role,
        messages: pageMessages.map((msg) => ({
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
      hasMore,
    })
  } catch (error) {
    console.error("[GET /api/rooms/[roomId]]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/rooms/[roomId] — update room (name / joinPermission) — admin/owner only
export async function PATCH(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params
    const body = await req.json()

    const membership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: meId } },
    })
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }
    if (!["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Admin required" }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name?.trim() || null
    // joinPermission can only be changed by owner/admin
    if (body.joinPermission !== undefined && ["open", "invite_only"].includes(body.joinPermission)) {
      updateData.joinPermission = body.joinPermission
    }

    const updated = await prisma.chatRoom.update({
      where: { id: roomId },
      data: updateData,
    })

    return NextResponse.json({ name: updated.name, joinPermission: updated.joinPermission })
  } catch (error) {
    console.error("[PATCH /api/rooms/[roomId]]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/rooms/[roomId] — dissolve room (owner only)
export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params

    const membership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: meId } },
    })
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }
    if (membership.role !== "owner") {
      return NextResponse.json({ error: "Owner required" }, { status: 403 })
    }

    // Cascade deletes members and messages (defined in schema)
    await prisma.chatRoom.delete({ where: { id: roomId } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/rooms/[roomId]]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
