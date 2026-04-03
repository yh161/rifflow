import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type Params = Promise<{ roomId: string }>

// POST /api/rooms/[roomId]/members — add a member by userId (admin/owner only)
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

    // Check room join permission — if invite_only, must be admin/owner to add
    const room = await prisma.chatRoom.findUnique({ where: { id: roomId } })
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }
    if (room.joinPermission === "invite_only" && !["owner", "admin"].includes(myMembership.role)) {
      return NextResponse.json({ error: "Admin required to add members" }, { status: 403 })
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

// PATCH /api/rooms/[roomId]/members — change role or kick a member
// Body: { targetUserId, action: "setAdmin"|"removeAdmin"|"transferOwnership"|"kick" }
export async function PATCH(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params
    const { targetUserId, action } = await req.json()

    if (!targetUserId || !action) {
      return NextResponse.json({ error: "targetUserId and action required" }, { status: 400 })
    }

    const myMembership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: meId } },
    })
    if (!myMembership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    const targetMembership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    })
    if (!targetMembership) {
      return NextResponse.json({ error: "Target user not in room" }, { status: 404 })
    }

    const myRole = myMembership.role
    const targetRole = targetMembership.role

    switch (action) {
      case "kick": {
        // Owner can kick anyone except self
        // Admin can kick members (not owner, not other admins)
        if (targetUserId === meId) {
          return NextResponse.json({ error: "Cannot kick yourself" }, { status: 400 })
        }
        if (myRole === "owner") {
          // Owner can kick admins and members
          if (targetRole === "owner") {
            return NextResponse.json({ error: "Cannot kick the owner" }, { status: 403 })
          }
        } else if (myRole === "admin") {
          // Admin can only kick regular members
          if (targetRole !== "member") {
            return NextResponse.json({ error: "Admins can only kick regular members" }, { status: 403 })
          }
        } else {
          return NextResponse.json({ error: "Admin required" }, { status: 403 })
        }
        await prisma.chatMember.delete({
          where: { roomId_userId: { roomId, userId: targetUserId } },
        })
        return NextResponse.json({ ok: true, action: "kicked" })
      }

      case "setAdmin": {
        // Owner only
        if (myRole !== "owner") {
          return NextResponse.json({ error: "Owner required" }, { status: 403 })
        }
        if (targetRole === "owner") {
          return NextResponse.json({ error: "Cannot change owner role this way" }, { status: 400 })
        }
        await prisma.chatMember.update({
          where: { roomId_userId: { roomId, userId: targetUserId } },
          data: { role: "admin" },
        })
        return NextResponse.json({ ok: true, action: "setAdmin", newRole: "admin" })
      }

      case "removeAdmin": {
        // Owner only
        if (myRole !== "owner") {
          return NextResponse.json({ error: "Owner required" }, { status: 403 })
        }
        if (targetRole !== "admin") {
          return NextResponse.json({ error: "Target is not an admin" }, { status: 400 })
        }
        await prisma.chatMember.update({
          where: { roomId_userId: { roomId, userId: targetUserId } },
          data: { role: "member" },
        })
        return NextResponse.json({ ok: true, action: "removeAdmin", newRole: "member" })
      }

      case "transferOwnership": {
        // Owner only
        if (myRole !== "owner") {
          return NextResponse.json({ error: "Owner required" }, { status: 403 })
        }
        // Transfer: target becomes owner, current owner becomes admin
        await prisma.$transaction([
          prisma.chatMember.update({
            where: { roomId_userId: { roomId, userId: targetUserId } },
            data: { role: "owner" },
          }),
          prisma.chatMember.update({
            where: { roomId_userId: { roomId, userId: meId } },
            data: { role: "admin" },
          }),
          prisma.chatRoom.update({
            where: { id: roomId },
            data: { ownerId: targetUserId },
          }),
        ])
        return NextResponse.json({ ok: true, action: "transferOwnership", newOwnerId: targetUserId })
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("[PATCH /api/rooms/[roomId]/members]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/rooms/[roomId]/members — leave room (self) or kick (admin with ?targetUserId=)
export async function DELETE(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params
    const url = new URL(req.url)
    const targetUserId = url.searchParams.get("targetUserId") ?? meId

    if (targetUserId !== meId) {
      // Kicking someone else — delegate to PATCH-like logic
      const myMembership = await prisma.chatMember.findUnique({
        where: { roomId_userId: { roomId, userId: meId } },
      })
      if (!myMembership || !["owner", "admin"].includes(myMembership.role)) {
        return NextResponse.json({ error: "Admin required" }, { status: 403 })
      }
      const targetMembership = await prisma.chatMember.findUnique({
        where: { roomId_userId: { roomId, userId: targetUserId } },
      })
      if (!targetMembership) {
        return NextResponse.json({ error: "Target not found" }, { status: 404 })
      }
      if (myMembership.role === "admin" && targetMembership.role !== "member") {
        return NextResponse.json({ error: "Admins can only kick regular members" }, { status: 403 })
      }
      if (targetMembership.role === "owner") {
        return NextResponse.json({ error: "Cannot kick the owner" }, { status: 403 })
      }
      await prisma.chatMember.delete({
        where: { roomId_userId: { roomId, userId: targetUserId } },
      })
    } else {
      // Leaving self
      const myMembership = await prisma.chatMember.findUnique({
        where: { roomId_userId: { roomId, userId: meId } },
      })
      if (!myMembership) {
        return NextResponse.json({ error: "Not a member" }, { status: 403 })
      }
      if (myMembership.role === "owner") {
        return NextResponse.json(
          { error: "Owner cannot leave — transfer ownership or dissolve the room first" },
          { status: 400 }
        )
      }
      await prisma.chatMember.delete({
        where: { roomId_userId: { roomId, userId: meId } },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/rooms/[roomId]/members]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
