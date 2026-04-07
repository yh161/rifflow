import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { searchService } from "@/app/services/search.service"

/**
 * GET /api/search
 *
 * Query params:
 *  q       – search query (required)
 *  type    – "all" | "workflows" | "users"  (default: "all")
 *  limit   – max results per category       (default: 10, max: 30)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const q     = searchParams.get("q")?.trim() ?? ""
    const type  = (searchParams.get("type") ?? "all") as "all" | "workflows" | "users"
    const limit = Math.min(Number(searchParams.get("limit") ?? 10), 30)

    if (!q) {
      return NextResponse.json({
        workflows: [],
        users: [],
        meta: { query: "", workflowsTotal: 0, usersTotal: 0 },
      })
    }

    const session = await getServerSession(authOptions)
    const userId  = session?.user?.id ?? null

    const results = await searchService.search({ query: q, type, limit, userId })

    return NextResponse.json(results)
  } catch (error) {
    console.error("[search GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
