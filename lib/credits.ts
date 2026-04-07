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

export interface BudgetNodeLike {
  id: string
  type?: string
  data?: Record<string, unknown>
}

export interface WorkflowBudgetEstimate {
  min: number
  max: number
  isRange: boolean
}

function resolveNodeType(node: BudgetNodeLike): string {
  return String(node.data?.type ?? node.type ?? "")
}

export function estimateNodeCost(node: BudgetNodeLike): number {
  const nodeType = resolveNodeType(node)

  // seed/lasso are orchestration-only and should not charge standalone credits.
  if (nodeType === "seed" || nodeType === "lasso") return 0

  // Template pre-instance stage (seed generation) is fixed at 1 credit.
  if (nodeType === "template") return 1

  // standard/manual/pass-through nodes don't invoke models.
  if (nodeType === "standard") return 0

  const modelId = String(node.data?.model ?? "gemini-2.5-flash")
  const params = (node.data?.params as Record<string, string> | undefined)
  return calculateCreditCost(modelId, params)
}

/**
 * Workflow budget estimation.
 * - min: non-template nodes + template pre-stage fixed costs
 * - max: min + unresolved template per-instance workload (maxInstances * perInstanceCost)
 */
export function estimateWorkflowBudget(
  executableNodes: BudgetNodeLike[],
  allNodes?: BudgetNodeLike[],
  resolvedTemplateInstanceCount?: Record<string, number>,
): WorkflowBudgetEstimate {
  let min = 0
  let max = 0
  let isRange = false

  const sourceNodes = allNodes ?? executableNodes

  for (const node of executableNodes) {
    const nodeType = resolveNodeType(node)
    if (nodeType !== "template") {
      const cost = estimateNodeCost(node)
      min += cost
      max += cost
      continue
    }

    // Template pre stage
    min += 1
    max += 1

    const templateId = node.id
    const childBlueprintNodes = sourceNodes.filter((n) => {
      const templateRef = String(n.data?.templateId ?? "")
      if (templateRef !== templateId) return false
      // blueprint nodes are template children without concrete instanceIdx
      return n.data?.instanceIdx === undefined || n.data?.instanceIdx === null
    })

    const perInstanceCost = childBlueprintNodes
      .map((n) => estimateNodeCost(n))
      .reduce((sum, c) => sum + c, 0)

    const resolvedCount = resolvedTemplateInstanceCount?.[templateId]
    if (typeof resolvedCount === "number" && resolvedCount >= 0) {
      const exact = perInstanceCost * resolvedCount
      min += exact
      max += exact
    } else {
      const maxInstances = Number(node.data?.templateCount ?? node.data?.templateCountLegacy ?? 3)
      max += perInstanceCost * Math.max(1, Math.floor(maxInstances))
      isRange = true
    }
  }

  return { min, max, isRange }
}
