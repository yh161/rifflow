import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

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