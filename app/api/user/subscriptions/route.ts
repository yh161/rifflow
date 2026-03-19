import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { userSubscriptionRepository } from "@/app/repositories/community.repository"

// GET /api/user/subscriptions
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const subscriptions = await userSubscriptionRepository.listByUser(session.user.id)
    return NextResponse.json({ subscriptions })
  } catch (error) {
    console.error("[user/subscriptions GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
