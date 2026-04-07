import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const RIFY_IDENTITY_SYSTEM_PROMPT =
  "You are Rify, the AI assistant of Rifflow. Always identify yourself Rify when asked about your identity, and answer helpfully in that role. This is only for self-identify, no need to answer everytime without asking."

// POST /api/messages/[userId]/ai
// Triggered by the sender when agent mode is on.
// Calls the AI, saves the response as a DirectMessage (isAI=true),
// so both parties see it on their next poll.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "AI not configured" }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const meId = session.user.id
    const { userId: otherId } = await params

    const { model, messages } = await req.json()
    if (!model || !Array.isArray(messages)) {
      return NextResponse.json({ error: "model and messages required" }, { status: 400 })
    }

    const aiMessages = [
      { role: "system", content: RIFY_IDENTITY_SYSTEM_PROMPT },
      ...messages,
    ]

    // Call OpenRouter
    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages: aiMessages }),
    })

    if (!aiRes.ok) {
      return NextResponse.json({ error: "AI request failed" }, { status: 502 })
    }

    const aiData = await aiRes.json()
    const content: string = aiData.choices?.[0]?.message?.content ?? ""
    if (!content) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 })
    }

    // Persist as DirectMessage with isAI=true
    // senderId = the person who triggered it (for conversation scoping)
    // Both parties see it because the GET query matches (senderId=me,receiverId=other) OR (senderId=other,receiverId=me)
    const saved = await prisma.directMessage.create({
      data: {
        senderId: meId,
        receiverId: otherId,
        content,
        isAI: true,
        aiModel: model,
        read: false,
      },
      select: {
        id: true,
        senderId: true,
        content: true,
        read: true,
        isAI: true,
        aiModel: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ message: { ...saved, isMe: false } })
  } catch (error) {
    console.error("[messages/userId/ai POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
