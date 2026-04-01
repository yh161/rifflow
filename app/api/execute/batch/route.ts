import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TEXT_MODEL_DEFS, TEXT_MODEL_MAP } from "@/app/services/constants"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"
import { runReplicate } from "@/app/services/replicate"

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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { wallet: true },
    })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (!user.wallet || user.wallet.points < 1) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 })
    }

    const systemPrompt = `You are a batch content generator. Respond with ONLY a valid JSON object. No markdown, no code blocks.

Required JSON format:
{
  "count": <number>,
  "seeds": [
    { "content": "<generated content>", "description": "<brief description>" }
  ]
}

Rules:
1. count must be an integer between 1 and ${maxInstances}
2. seeds array must contain exactly count items
3. Each seed MUST have a content field with complete generated content
4. All content should be diverse and meaningfully different
5. Do not include any text outside the JSON object`

    const userPrompt = upstreamContent
      ? `Input context: ${upstreamContent}\n\nGeneration request: ${prompt}\n\nGenerate up to ${maxInstances} variations.`
      : `${prompt}\n\nGenerate up to ${maxInstances} variations.`

    const modelDef = TEXT_MODEL_DEFS[model] ?? TEXT_MODEL_DEFS[DEFAULT_TEXT_MODEL_ID]

    let rawContent: string

    if (modelDef?.backend === "replicate") {
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`
      const output = await runReplicate(modelDef.modelPath, {
        prompt:         combinedPrompt,
        temperature:    0.7,
        max_new_tokens: 2000,
      })
      rawContent = Array.isArray(output)
        ? (output as string[]).join("")
        : String(output ?? "")
    } else {
      const orModel = TEXT_MODEL_MAP[model] ?? TEXT_MODEL_MAP[DEFAULT_TEXT_MODEL_ID] ?? "deepseek/deepseek-chat"
      const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({
          model: orModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt }
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
      rawContent = aiJson.choices?.[0]?.message?.content ?? ""
    }

    let result: BatchGenerationResponse
    try {
      result = JSON.parse(rawContent)
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0])
        } catch {
          return NextResponse.json({ error: "Invalid JSON response from LLM" }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: "Invalid JSON response from LLM" }, { status: 500 })
      }
    }

    if (!result.seeds || !Array.isArray(result.seeds) || result.seeds.length === 0) {
      return NextResponse.json({ error: "Invalid response format: missing seeds" }, { status: 500 })
    }

    if (result.seeds.length > maxInstances) {
      result.seeds = result.seeds.slice(0, maxInstances)
    }

    result.count = result.seeds.length

    result.seeds = result.seeds.map((seed, idx) => ({
      content: seed.content || `Variation ${idx + 1}`,
      description: seed.description || `Instance ${idx + 1}`,
    }))

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: user.id }, data: { points: { decrement: 1 } } }),
      prisma.executionLog.create({
        data: {
          userId: user.id,
          nodeType: "template",
          inputTokens:  0,
          outputTokens: 0,
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
