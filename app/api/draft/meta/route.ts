/**
 * GET /api/draft/meta
 *
 * Returns the latest draft template's metadata (name, description, tags, thumbnail)
 * for the current user. Used by canvas pack export to embed metadata.
 */

import { NextResponse }      from "next/server"
import { getServerSession }  from "next-auth"
import { authOptions }       from "@/lib/auth"
import { templateRepository } from "@/app/repositories/template.repository"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const templates = await templateRepository.list({
      creatorId: session.user.id,
      status:    "draft",
      orderBy:   "newest",
      limit:     1,
      offset:    0,
    })

    const latest = templates[0]
    if (!latest) {
      return NextResponse.json({})
    }

    return NextResponse.json({
      name:        latest.name,
      description: latest.description,
      tags:        latest.tags,
      thumbnail:   latest.thumbnail,
    })
  } catch {
    return NextResponse.json({})
  }
}
