import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TEXT_MODELS } from "@/lib/models"
import { runReplicate } from "@/app/services/replicate"

type Params = Promise<{ roomId: string }>

// Convert chat messages array → single prompt string for Replicate models
// (Replicate expects a prompt string, not an OpenAI messages array)
function messagesToPrompt(messages: { role: string; content: string }[]): string {
  return messages
    .map(m => (m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`))
    .join("\n") + "\nAssistant:"
}

// POST /api/rooms/[roomId]/ai
// Triggered by a member who has agent mode on.
// Routes to Replicate or OpenRouter depending on model backend.
// Saves the AI reply to DB — all members see it on next poll.
export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const meId = session.user.id
    const { roomId } = await params
    const { model, messages } = await req.json()

    if (!model || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "model and messages required" }, { status: 400 })
    }

    const membership = await prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId: meId } },
    })
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    // Look up model definition
    const modelDef = TEXT_MODELS.find(m => m.id === model)
    const backend = modelDef?.backend ?? "openrouter"

    let content = ""

    if (backend === "replicate") {
      // ── Replicate path ─────────────────────────────────────────
      if (!process.env.REPLICATE_API_TOKEN) {
        return NextResponse.json({ error: "Replicate not configured" }, { status: 503 })
      }

      const modelPath = modelDef!.orModel
      const tokenParam = modelDef?.replicateTokenParam ?? "max_tokens"
      const prompt = messagesToPrompt(messages)

      const input: Record<string, unknown> = {
        prompt,
        [tokenParam]: 2048,
      }

      // Only add temperature if model supports it
      if (!modelDef?.replicateNoTemperature) {
        input.temperature = 0.7
      }

      const output = await runReplicate(modelPath, input)

      // Replicate returns string or string[]
      if (Array.isArray(output)) {
        content = output.join("")
      } else if (typeof output === "string") {
        content = output
      } else {
        content = String(output ?? "")
      }
    } else {
      // ── OpenRouter path ────────────────────────────────────────
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) {
        return NextResponse.json({ error: "OpenRouter not configured" }, { status: 503 })
      }

      const orModel = modelDef?.orModel ?? "deepseek/deepseek-chat"

      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
          "X-Title": "Rifflow Chat",
        },
        body: JSON.stringify({ model: orModel, messages, max_tokens: 2048 }),
      })

      if (!aiRes.ok) {
        const errText = await aiRes.text()
        console.error("[rooms/ai] OpenRouter error:", aiRes.status, errText)
        return NextResponse.json({ error: "AI request failed", detail: errText }, { status: 502 })
      }

      const aiData = await aiRes.json()
      content = aiData.choices?.[0]?.message?.content ?? ""
    }

    if (!content.trim()) {
      console.error("[rooms/ai] Empty AI response for model:", model)
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 })
    }

    // Persist to DB — senderId null marks AI
    const [saved] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: { roomId, senderId: null, content: content.trim(), isAI: true, aiModel: model },
      }),
      prisma.chatRoom.update({
        where: { id: roomId },
        data: { updatedAt: new Date() },
      }),
    ])

    return NextResponse.json({
      message: {
        id: saved.id,
        content: saved.content,
        createdAt: saved.createdAt,
        isMe: false,
        isAI: true,
        aiModel: saved.aiModel,
        senderId: null,
        senderName: null,
        senderImage: null,
      },
    })
  } catch (error) {
    console.error("[POST /api/rooms/[roomId]/ai]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
