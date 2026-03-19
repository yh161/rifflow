import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { favoriteRepository } from "@/app/repositories/community.repository"

// POST /api/community/templates/[id]/favorite — toggle 收藏
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const action = await favoriteRepository.toggle(session.user.id, id)
    return NextResponse.json({ action })
  } catch (error) {
    console.error("[favorite POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
