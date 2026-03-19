import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isCreator: true,
        creatorBio: true,
        wallet: {
          select: { points: true },
        },
        _count: {
          select: {
            favorites: true,
            templateExecutions: true,
            // templates created by this user
          },
        },
        subscriptions: {
          where: { status: "active" },
          select: {
            id: true,
            status: true,
            plan: {
              select: {
                name: true,
                price: true,
                creator: { select: { id: true, name: true, image: true } },
              },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Count templates created by this user
    const templatesCount = await prisma.template.count({
      where: { creatorId: session.user.id },
    })

    // Recent transactions (last 8)
    const transactions = await prisma.transaction.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        amount: true,
        type: true,
        createdAt: true,
        metadata: true,
      },
    })

    return NextResponse.json({
      user: {
        ...user,
        templatesCount,
        executionsCount: user._count.templateExecutions,
        favoritesCount: user._count.favorites,
        points: user.wallet?.points ?? 0,
      },
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
    })
  } catch (error) {
    console.error("[user/me GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
