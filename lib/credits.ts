/**
 * Credit cost calculation — shared by frontend (preview) and backend (deduction).
 * 1 credit = $0.01 USD
 *
 * Pricing based on Replicate invoices (unified per-model, param-independent):
 *   Gemini 3.1 Pro         →  2 credits/call
 *   Gemini 2.5 Flash Image  →  $0.039/image  ≈ 4 credits
 *   Grok Video              →  $0.05/second  = 5 credits/sec
 *   Other text models        →  1 credit/call (fixed for now)
 */

export function calculateCreditCost(
  modelId: string,
  params?: Record<string, string>
): number {
  if (modelId === "gemini-3.1-pro") return 2

  // ── Text models (all fixed at 1 credit for now) ─────────────────────────
  const textModelIds = [
    "deepseek-v3", "deepseek-v3-2", "deepseek-r1",
    "qwen3-32b", "qwen3-235b", "qwq-32b",
  ]
  if (textModelIds.includes(modelId)) return 1

  // ── Image models ─────────────────────────────────────────────────────────
  if (modelId === "nano-banana") return 4   // $0.039 → round up to 4¢

  if (modelId === "nano-banana-pro") {
    const res = params?.resolution ?? "2K"
    if (res === "4K") return 30             // $0.30
    return 15                               // 1K / 2K both $0.15
  }

  // ── Video models ─────────────────────────────────────────────────────────
  if (modelId === "grok-video") {
    const duration = parseInt(params?.duration ?? "5", 10)
    return duration * 5   // $0.05/s = 5 credits/s
  }

  // fallback: 1 credit
  return 1
}

/** Human-readable label for the Generate button, e.g. "25 credits" */
export function creditLabel(modelId: string, params?: Record<string, string>): string {
  const cost = calculateCreditCost(modelId, params)
  return `${cost} credit${cost === 1 ? "" : "s"}`
}
