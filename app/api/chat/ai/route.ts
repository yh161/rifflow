import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TEXT_MODELS } from "@/lib/models"

// Map internal model IDs → OpenRouter model paths for conversational chat.
// Replicate-backend models are mapped to their nearest OpenRouter equivalents.
const CHAT_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash": "google/gemini-2.5-flash-preview-05-20",
  "gemini-3.1-pro":   "google/gemini-2.5-pro",
  "claude-opus-4.6":  "anthropic/claude-opus-4-5",
  "gpt-5.2":          "openai/gpt-4o",
  "deepseek-v3":      "deepseek/deepseek-chat",
  "qwen3-32b":        "qwen/qwen3-32b",
  "llama-3.3-70b":    "meta-llama/llama-3.3-70b-instruct",
  "llama-3.1-8b":     "meta-llama/llama-3.1-8b-instruct",
}

// For openrouter-backend models, use their orModel directly
for (const m of TEXT_MODELS) {
  if (m.backend === "openrouter" && !CHAT_MODEL_MAP[m.id]) {
    CHAT_MODEL_MAP[m.id] = m.orModel
  }
}

const FALLBACK_MODEL = "deepseek/deepseek-chat"
const RIFY_IDENTITY_SYSTEM_PROMPT =
  "You are Rify, the AI assistant of Rifflow. Always identify yourself as Rify (a Rifflow agent) when asked about your identity, and answer helpfully in that role."

// POST /api/chat/ai
// Body: { model: string, messages: { role: "user"|"assistant", content: string }[], systemPrompt?: string }
// Returns: { content: string }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { model, messages, systemPrompt } = await req.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 })
    }

    const orModel = CHAT_MODEL_MAP[model] ?? FALLBACK_MODEL

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 })
    }

    const systemMessages = [
      { role: "system", content: RIFY_IDENTITY_SYSTEM_PROMPT },
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ]

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
        "X-Title": "Rifflow Chat",
      },
      body: JSON.stringify({
        model: orModel,
        messages: [...systemMessages, ...messages],
        max_tokens: 2048,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error("[chat/ai] OpenRouter error:", response.status, errText)
      return NextResponse.json(
        { error: "AI model error", detail: errText },
        { status: response.status }
      )
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const content = data.choices?.[0]?.message?.content ?? ""
    return NextResponse.json({ content })
  } catch (error) {
    console.error("[chat/ai] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
