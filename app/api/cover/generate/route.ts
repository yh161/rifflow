/**
 * POST /api/cover/generate
 * Generate a canvas cover image using Replicate (google/nano-banana).
 * Body: { prompt?: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { prisma }                    from "@/lib/prisma"
import { runReplicate, urlToBase64, extractUrl } from "@/app/services/replicate"

const COST = 1

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: "图像生成服务未配置。请在 .env 中设置 REPLICATE_API_TOKEN。" }, { status: 501 })
  }

  let body: { prompt?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { prompt = "A clean, modern, minimalist cover image for an AI workflow canvas. Flat design, soft gradients, geometric shapes, professional." } = body

  const wallet = await prisma.wallet.findUnique({ where: { userId: session.user.id } })
  if (!wallet || wallet.points < COST) {
    return NextResponse.json({ error: `积分不足，此操作需要 ${COST} 积分` }, { status: 402 })
  }

  await prisma.wallet.update({
    where: { userId: session.user.id },
    data:  { points: { decrement: COST } },
  })

  try {
    const output   = await runReplicate("google/nano-banana", { prompt })
    const imageUrl = extractUrl(output)
    const { b64, mime } = await urlToBase64(imageUrl)
    const dataUrl = `data:${mime};base64,${b64}`

    return NextResponse.json({ url: dataUrl })
  } catch (err) {
    // Refund on failure
    await prisma.wallet.update({
      where: { userId: session.user.id },
      data:  { points: { increment: COST } },
    }).catch(() => {})

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "生成失败，积分已退还" },
      { status: 500 },
    )
  }
}
