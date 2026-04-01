import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// ─────────────────────────────────────────────
// GET /api/draft/snapshots  — return all undo snapshots (oldest first)
// ─────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const snapshots = await prisma.riffDraftSnapshot.findMany({
    where:   { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select:  { id: true, nodesJson: true, edgesJson: true, viewportJson: true, createdAt: true },
  })

  return NextResponse.json({ snapshots })
}
