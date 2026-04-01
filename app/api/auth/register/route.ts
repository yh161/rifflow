import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

function getValidInviteCodes(): string[] {
  const envCodes = process.env.INVITE_CODES
  if (!envCodes) return []
  return envCodes.split(",").map(c => c.trim()).filter(Boolean)
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, inviteCode } = await req.json()

    // Validate invite code
    const validCodes = getValidInviteCodes()
    console.log("[register] Invite code received:", inviteCode)
    console.log("[register] Valid codes configured:", validCodes)
    console.log("[register] ENV INVITE_CODES:", process.env.INVITE_CODES)

    if (!inviteCode || !validCodes.includes(inviteCode)) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 403 })
    }

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ exists: true })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        inviteVerified: true,
        wallet: {
          create: {
            points: 100,
          },
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[register]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}