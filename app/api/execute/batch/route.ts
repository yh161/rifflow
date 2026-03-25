import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const TEXT_MODEL_MAP: Record<string, string> = {
  "gemini-2.0-flash": "google/gemini-2.0-flash-001",
  "gemini-1.5-pro": "google/gemini-pro-1.5",
  "gpt-4o": "openai/gpt-4o",
  "claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
}

const baseHeaders = () => ({
  "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
})

export interface BatchGenerationRequest {
  prompt: string
  model: string
  maxInstances: number
  upstreamContent?: string
}

export interface BatchGenerationResponse {
  count: number
  seeds: Array<{
    content: string
    description?: string
  }>
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { prompt, model, maxInstances, upstreamContent } = await req.json() as BatchGenerationRequest

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    if (!maxInstances || maxInstances < 1 || maxInstances > 20) {
      return NextResponse.json({ error: "Max instances must be between 1 and 20" }, { status: 400 })
    }

    // Check credits
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { wallet: true },
    })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (!user.wallet || user.wallet.points < 1) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
    }

    // Build the system prompt for batch generation
    const systemPrompt = `You are a batch content generator. Your task is to analyze the user's request and generate multiple variations of content.

CRITICAL: You must respond with ONLY a valid JSON object. No markdown, no code blocks, no explanation text.

Required JSON format:
{
  "count": <number>,
  "seeds": [
    {
      "content": "<the actual generated content - this will be inserted into seed nodes>",
      "description": "<brief description of what makes this variation unique>"
    }
  ]
}

Rules:
1. count must be an integer between 1 and ${maxInstances}
2. seeds array must contain exactly 'count' number of items
3. Each seed MUST have a "content" field with the complete generated content
4. Each seed SHOULD have a "description" field (1-2 sentences explaining the variation)
5. All content should be diverse and meaningfully different from each other
6. Content should be complete, ready to use, and match the user's requested style
7. Do not include any text outside the JSON object

Example response for "Generate 3 product descriptions":
{
  "count": 3,
  "seeds": [
    {
      "content": "Experience ultimate comfort with our ergonomic office chair. Designed for long work sessions, featuring adjustable lumbar support and breathable mesh back.",
      "description": "Focuses on comfort and ergonomics for office workers"
    },
    {
      "content": "Transform your workspace with our premium leather executive chair. Hand-stitched details and polished aluminum base make a bold statement.",
      "description": "Emphasizes luxury and executive style"
    },
    {
      "content": "Stay productive on a budget with our affordable task chair. Simple design, reliable construction, and all-day comfort without breaking the bank.",
      "description": "Highlights affordability and value proposition"
    }
  ]
}`

    const userPrompt = upstreamContent
      ? `Input context: ${upstreamContent}\n\nGeneration request: ${prompt}\n\nGenerate up to ${maxInstances} variations.`
      : `${prompt}\n\nGenerate up to ${maxInstances} variations.`

    const orModel = TEXT_MODEL_MAP[model] ?? "google/gemini-2.0-flash-001"

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        model: orModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      console.error("[batch] LLM error:", aiRes.status, err)
      return NextResponse.json({ error: `LLM error (${aiRes.status})` }, { status: 500 })
    }

    const aiJson = await aiRes.json()
    const rawContent = aiJson.choices?.[0]?.message?.content ?? ""

    // Parse the JSON response
    let result: BatchGenerationResponse
    try {
      result = JSON.parse(rawContent)
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = rawContent.match(/```json\n?([\s\S]*?)\n?```/) || rawContent.match(/{[\s\S]*}/)
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[1] || jsonMatch[0])
        } catch {
          return NextResponse.json({ error: "Invalid JSON response from LLM" }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: "Invalid JSON response from LLM" }, { status: 500 })
      }
    }

    // Validate and sanitize the result
    if (!result.seeds || !Array.isArray(result.seeds) || result.seeds.length === 0) {
      return NextResponse.json({ error: "Invalid response format: missing seeds" }, { status: 500 })
    }

    // Enforce max instances limit
    if (result.seeds.length > maxInstances) {
      result.seeds = result.seeds.slice(0, maxInstances)
    }

    result.count = result.seeds.length

    // Ensure each seed has required fields
    result.seeds = result.seeds.map((seed, idx) => ({
      content: seed.content || `Variation ${idx + 1}`,
      description: seed.description || `Instance ${idx + 1}`,
    }))

    // Deduct credits and log execution
    const inputTokens = aiJson.usage?.prompt_tokens ?? 0
    const outputTokens = aiJson.usage?.completion_tokens ?? 0

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: user.id }, data: { points: { decrement: 1 } } }),
      prisma.executionLog.create({
        data: {
          userId: user.id,
          nodeType: "template",
          inputTokens,
          outputTokens,
          creditCost: 1,
          status: "SUCCESS",
        },
      }),
    ])

    return NextResponse.json(result)

  } catch (err: unknown) {
    console.error("[execute/batch] unhandled:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
