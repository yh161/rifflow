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

    // Fetch user with wallet
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
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Count related data
    const [templatesCount, favoritesCount, executionsCount, subscriptions, transactions] = await Promise.all([
      // Count templates created by this user
      prisma.template.count({ where: { creatorId: session.user.id } }),
      // Count favorites
      prisma.userFavorite.count({ where: { userId: session.user.id } }),
      // Count template executions
      prisma.templateExecution.count({ where: { userId: session.user.id } }),
      // Get active subscriptions
      prisma.userSubscription.findMany({
        where: { userId: session.user.id, status: "active" },
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
      }),
      // Recent transactions (last 8)
      prisma.transaction.findMany({
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
      }),
    ])

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        isCreator: user.isCreator,
        creatorBio: user.creatorBio,
        templatesCount,
        executionsCount,
        favoritesCount,
        points: user.wallet?.points ?? 0,
        subscriptions,
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

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, image } = body

    // Validate input
    if (name !== undefined && (typeof name !== "string" || name.length > 50)) {
      return NextResponse.json(
        { error: "Invalid name. Must be a string with max 50 characters." },
        { status: 400 }
      )
    }

    if (image !== undefined && (typeof image !== "string" || image.length > 500)) {
      return NextResponse.json(
        { error: "Invalid image URL. Must be a string with max 500 characters." },
        { status: 400 }
      )
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(name !== undefined && { name: name.trim() || null }),
        ...(image !== undefined && { image: image.trim() || null }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isCreator: true,
        creatorBio: true,
      },
    })

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error("[user/me PUT]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
