import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function getValidInviteCodes(): string[] {
  const envCodes = process.env.INVITE_CODES
  if (!envCodes) return []
  return envCodes.split(",").map(c => c.trim()).filter(Boolean)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { inviteCode } = await req.json()
  const validCodes = getValidInviteCodes()

  if (!inviteCode || !validCodes.includes(inviteCode.trim())) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 403 })
  }

  // Check if already verified
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (user.inviteVerified) return NextResponse.json({ success: true })

  // Mark verified and grant 100 points
  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { inviteVerified: true },
    }),
    prisma.wallet.upsert({
      where: { userId: session.user.id },
      update: { points: { increment: 100 } },
      create: { userId: session.user.id, points: 100 },
    }),
  ])

  return NextResponse.json({ success: true })
}
