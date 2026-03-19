import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { favoriteRepository } from "@/app/repositories/community.repository"

// GET /api/user/favorites — 获取当前用户收藏的模板
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const favorites = await favoriteRepository.listByUser(session.user.id)
    return NextResponse.json({ favorites })
  } catch (error) {
    console.error("[user/favorites GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
