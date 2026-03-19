import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { userAssetRepository } from "@/app/repositories/community.repository"

// GET /api/user/assets?starred=true
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const onlyStarred = req.nextUrl.searchParams.get("starred") === "true"
    const assets = await userAssetRepository.listByUser(session.user.id, onlyStarred)
    return NextResponse.json({ assets })
  } catch (error) {
    console.error("[user/assets GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
