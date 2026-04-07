// Workflow DAG Execution Engine

import { prisma } from "@/lib/prisma"
import { JobService } from "./job.service"
import type { MultimodalContent } from "@/lib/prompt-resolver"
import { Prisma } from "@prisma/client"
import { DEFAULT_TEXT_MODEL_ID } from "@/lib/models"

export interface WorkflowNode {
  id: string
  type: string
  data: {
    type?: string
    content?: string
    prompt?: string
    model?: string
    params?: Record<string, string>
    mode?: string
    [key: string]: unknown
  }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  targetHandle?: string
}

export interface WorkflowSubgraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowBudget {
  /** Total credits spent by this workflow */
  spent: number
  /** Optional max budget (for future use) */
  limit?: number
}

export interface WorkflowExecutionContext {
  workflowJobId: string
  userId: string
  results: Map<string, unknown>
  budget: WorkflowBudget
}

export type WorkflowGateStatus =
  | "queueing_in_workflow"
  | "waiting_upstream"
  | "queueing_job"
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "paused"
  | "waiting_manual"

interface WorkflowMetaState {
  nodeStates: Record<string, WorkflowGateStatus>
  nodeSignals?: Record<string, { signal: string; result?: unknown }>
}

const CONTROL_POLL_MS = 500

/**
 * DAG-based Workflow Execution Engine with pause/resume/stop support
 *
 * Status lifecycle:
 *   pending → running → completed | failed | paused | stopped
 *
 * Pause semantics:
 *   - Immediately sets status = 'paused', stops dispatching new nodes
 *   - Currently executing node Jobs continue to completion
 *   - Waits in a polling loop for resume or stop signal
 *
 * Manual node semantics:
 *   - Node with data.mode === 'manual' → nodeState set to 'waiting_manual'
 *   - WorkflowEngine polls for nodeSignals[nodeId] = 'manual_complete'
 *   - Frontend calls POST /api/execute/workflow/[id]/nodes/[nodeId]/complete to unblock
 */
export class WorkflowEngine {
  private jobService: JobService

  constructor(jobService?: JobService) {
    this.jobService = jobService || new JobService()
  }

  // ── Control signal helpers ─────────────────────────────────────────────────

  private async readControlSignal(workflowJobId: string): Promise<string | null> {
    // Use raw select to read the controlSignal column.
    // Cast through unknown to handle stale TS language-server cache after prisma generate.
    const wf = await prisma.workflowJob.findUnique({
      where: { id: workflowJobId },
    }) as ({ controlSignal?: string | null } & object) | null
    return wf?.controlSignal ?? null
  }

  /**
   * Low-level helper: set controlSignal (and optionally status) via raw SQL.
   * Used to work around TS language-server caching old Prisma types after
   * `prisma generate` adds the controlSignal column.
   */
  private async setSignal(
    workflowJobId: string,
    signal: string | null,
    status?: string,
  ): Promise<void> {
    if (status !== undefined) {
      await prisma.$executeRaw`
        UPDATE "WorkflowJob"
        SET "controlSignal" = ${signal}, "status" = ${status}, "updatedAt" = NOW()
        WHERE "id" = ${workflowJobId}
      `
    } else {
      await prisma.$executeRaw`
        UPDATE "WorkflowJob"
        SET "controlSignal" = ${signal}, "updatedAt" = NOW()
        WHERE "id" = ${workflowJobId}
      `
    }
  }

  async pauseWorkflow(workflowJobId: string): Promise<void> {
    await this.setSignal(workflowJobId, "pause")
  }

  async resumeWorkflow(workflowJobId: string): Promise<void> {
    await this.setSignal(workflowJobId, "resume")
  }

  async stopWorkflow(workflowJobId: string): Promise<void> {
    await this.setSignal(workflowJobId, "stop")
  }

  /**
   * Execute a workflow subgraph
   */
  async executeWorkflow(
    userId: string,
    subgraph: WorkflowSubgraph,
    entryData?: Record<string, unknown>
  ): Promise<{ workflowJobId: string; success: boolean; error?: string }> {
    // 1. Create WorkflowJob record
    const initialNodeStates = Object.fromEntries(
      subgraph.nodes.map((n) => [n.id, "queueing_in_workflow"] as const)
    ) as Record<string, WorkflowGateStatus>

    const workflowJob = await prisma.workflowJob.create({
      data: {
        userId,
        status: "pending",
        totalNodes: subgraph.nodes.length,
        completedCount: 0,
        failedCount: 0,
        results: {
          __workflow: {
            nodeStates: initialNodeStates,
          },
        },
      },
    })

    const workflowJobId = workflowJob.id

    // 2. Initialize execution context with budget tracking
    const ctx: WorkflowExecutionContext = {
      workflowJobId,
      userId,
      results: new Map(),
      budget: { spent: 0 },
    }

    // 3. Start execution asynchronously (fire-and-forget)
    this.runExecution(ctx, subgraph, entryData).catch((err) => {
      console.error("[WorkflowEngine] Execution failed:", err)
      prisma.workflowJob.update({
        where: { id: workflowJobId },
        data: { status: "failed", error: err.message },
      }).catch(console.error)
    })

    return { workflowJobId, success: true }
  }

  // ── Filter helpers ────────────────────────────────────────────────────────

  private isServerLocalUrl(url: string): boolean {
    try {
      const { hostname, protocol } = new URL(url)
      return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === 'minio' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        protocol === 'file:' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')
      )
    } catch {
      return true
    }
  }

  private async fetchImageAsBase64(url: string): Promise<string | null> {
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      return `data:${contentType};base64,${base64}`
    } catch {
      return null
    }
  }

  private async buildFilterItems(
    inEdges: WorkflowEdge[],
    results: Map<string, unknown>,
    nodeMap: Map<string, WorkflowNode>,
    mode: 'label' | 'content',
  ): Promise<{
    contentBlocks: MultimodalContent[]
    items: Array<{ id: string; label?: string; type?: string }>
  }> {
    const items: Array<{ id: string; label?: string; type?: string }> = []
    const blocks: MultimodalContent[] = [{ type: 'text', text: 'Items to evaluate:' }]

    for (let i = 0; i < inEdges.length; i++) {
      const edge    = inEdges[i]
      const srcNode = nodeMap.get(edge.source)
      const result  = results.get(edge.source) as Record<string, unknown> | undefined

      const label    = (srcNode?.data.label as string | undefined) ?? (srcNode?.data.name as string | undefined)
      const nodeType = (srcNode?.data.type as string | undefined) ?? 'text'

      items.push({ id: edge.source, label, type: nodeType })

      const header = `[${i + 1}] ${label ? `"${label}"` : `item_${i + 1}`} (${nodeType})`

      if (mode === 'content' && result) {
        blocks.push({ type: 'text', text: header })

        if (nodeType === 'image') {
          const src  = (result.content as string) || (result.src as string)
          const b64  = result.b64 as string | undefined
          const mime = (result.mime as string) || 'image/jpeg'

          if (b64) {
            blocks.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'low' } })
          } else if (src) {
            if (src.startsWith('blob:') || this.isServerLocalUrl(src)) {
              const encoded = await this.fetchImageAsBase64(src)
              blocks.push(encoded
                ? { type: 'image_url', image_url: { url: encoded, detail: 'low' } }
                : { type: 'text', text: '[Image unavailable]' })
            } else {
              blocks.push({ type: 'image_url', image_url: { url: src, detail: 'low' } })
            }
          }
        } else {
          const text = ((result.content as string) || '').slice(0, 400)
          if (text) blocks.push({ type: 'text', text: `"${text}${(result.content as string)?.length > 400 ? '…' : ''}"` })
        }
      } else {
        blocks.push({ type: 'text', text: header })
      }
    }

    return { contentBlocks: blocks, items }
  }

  private parseFilterResponse(
    rawContent: string,
    items: Array<{ id: string; label?: string; type?: string }>,
  ): { passed: typeof items; filtered: typeof items } | null {
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*"passed"[\s\S]*\}/)
      const jsonStr   = jsonMatch ? jsonMatch[0] : rawContent.trim()
      const parsed    = JSON.parse(jsonStr) as { passed?: number[]; filtered?: number[] }

      if (!parsed.passed && !parsed.filtered) return null

      const passedSet = new Set((parsed.passed ?? []).map((n: number) => n - 1))
      return {
        passed:   items.filter((_, i) => passedSet.has(i)),
        filtered: items.filter((_, i) => !passedSet.has(i)),
      }
    } catch {
      return null
    }
  }

  private parseIndexExpression(expr: string, maxIndex?: number): number[] {
    if (!expr?.trim()) return []
    const out = new Set<number>()
    const tokens = expr.split(',').map((s) => s.trim()).filter(Boolean)

    for (const token of tokens) {
      const m = token.match(/^(\d+)\s*-\s*(\d+)$/)
      if (m) {
        const a = Number(m[1])
        const b = Number(m[2])
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue
        const start = Math.min(a, b)
        const end = Math.max(a, b)
        for (let i = start; i <= end; i++) {
          if (i < 1) continue
          if (maxIndex && i > maxIndex) continue
          out.add(i)
        }
        continue
      }

      const single = Number(token)
      if (Number.isFinite(single) && single >= 1) {
        if (!maxIndex || single <= maxIndex) out.add(single)
      }
    }

    return [...out].sort((a, b) => a - b)
  }

  /**
   * Core DAG execution algorithm with pause/resume/stop state machine
   */
  private async runExecution(
    ctx: WorkflowExecutionContext,
    subgraph: WorkflowSubgraph,
    entryData?: Record<string, unknown>
  ): Promise<void> {
    const { workflowJobId } = ctx

    // Build DAG structures
    const { adjacency, inDegree, nodeMap } = this.buildDAG(subgraph)

    const nodeStates: Record<string, WorkflowGateStatus> = Object.fromEntries(
      subgraph.nodes.map((n) => [n.id, "queueing_in_workflow"] as const)
    )

    // Update status to running (use setSignal to include controlSignal reset)
    await this.setSignal(workflowJobId, null, "running")

    // Initialize with source nodes (in-degree = 0)
    const queue: string[] = []
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId)
      } else {
        nodeStates[nodeId] = "waiting_upstream"
      }
    }

    await this.persistWorkflowSnapshot(ctx, nodeStates, 0, 0)

    // If entryData provided, inject into source nodes
    if (entryData) {
      for (const nodeId of queue) {
        const node = nodeMap.get(nodeId)
        if (node) {
          node.data = { ...node.data, ...entryData }
        }
      }
    }

    const executing = new Set<string>()
    const completed = new Set<string>()
    const failed = new Set<string>()

    // Main execution loop
    while (queue.length > 0 || executing.size > 0) {
      // ── Check control signal ──────────────────────────────────────────────
      const ctrl = await this.readControlSignal(workflowJobId)

      if (ctrl === "stop") {
        await this.setSignal(workflowJobId, null, "stopped")
        return
      }

      if (ctrl === "pause") {
        // Immediately mark paused — stop dispatching new nodes
        await this.setSignal(workflowJobId, null, "paused")
        // Wait for resume or stop (executing nodes continue independently)
        while (true) {
          await new Promise((r) => setTimeout(r, CONTROL_POLL_MS))
          const nextCtrl = await this.readControlSignal(workflowJobId)
          if (nextCtrl === "resume") {
            await this.setSignal(workflowJobId, null, "running")
            break
          }
          if (nextCtrl === "stop") {
            await this.setSignal(workflowJobId, null, "stopped")
            return
          }
        }
      }

      // Start new executions (limited concurrency)
      while (queue.length > 0 && executing.size < 5) {
        const nodeId = queue.shift()!
        const node = nodeMap.get(nodeId)
        if (!node) continue

        // ── Manual node: pause for user input ────────────────────────────────
        if (node.data.mode === "manual") {
          nodeStates[nodeId] = "waiting_manual"
          await this.persistWorkflowSnapshot(ctx, nodeStates, completed.size, failed.size)

          // Wait for frontend signal
          const manualResult = await this.waitForManualNode(workflowJobId, nodeId)

          if (manualResult === null) {
            // Stopped while waiting
            return
          }

          // Use provided result or empty content
          ctx.results.set(nodeId, manualResult)
          completed.add(nodeId)
          nodeStates[nodeId] = "done"

          const neighbors = adjacency.get(nodeId) || []
          for (const neighborId of neighbors) {
            const newDegree = (inDegree.get(neighborId) || 0) - 1
            inDegree.set(neighborId, newDegree)
            if (newDegree === 0) {
              nodeStates[neighborId] = "queueing_in_workflow"
              queue.push(neighborId)
            }
          }
          await this.persistWorkflowSnapshot(ctx, nodeStates, completed.size, failed.size)
          continue
        }

        executing.add(nodeId)
        nodeStates[nodeId] = "queueing_job"
        await this.persistWorkflowSnapshot(ctx, nodeStates, completed.size, failed.size)

        // Execute node asynchronously
        this.executeNode(ctx, node, subgraph.edges, nodeMap).then((result) => {
          executing.delete(nodeId)

          if (result.success) {
            completed.add(nodeId)
            ctx.results.set(nodeId, result.data)
            nodeStates[nodeId] = "done"

            // Update in-degrees and add new sources to queue
            const neighbors = adjacency.get(nodeId) || []
            for (const neighborId of neighbors) {
              const newDegree = (inDegree.get(neighborId) || 0) - 1
              inDegree.set(neighborId, newDegree)
              if (newDegree === 0) {
                nodeStates[neighborId] = "queueing_in_workflow"
                queue.push(neighborId)
              }
            }
          } else {
            console.error(`[WorkflowEngine] Node ${nodeId} execution failed`)
            failed.add(nodeId)
            nodeStates[nodeId] = "failed"
          }

          this.persistWorkflowSnapshot(ctx, nodeStates, completed.size, failed.size)
            .catch((err) => console.error("[WorkflowEngine] persist snapshot failed:", err))
        }).catch((err) => {
          console.error(`[WorkflowEngine] Node ${nodeId} execution error:`, err)
          executing.delete(nodeId)
          failed.add(nodeId)
          nodeStates[nodeId] = "failed"
          this.persistWorkflowSnapshot(ctx, nodeStates, completed.size, failed.size)
            .catch((persistErr) => console.error("[WorkflowEngine] persist snapshot failed:", persistErr))
        })
      }

      // Small delay to prevent tight loop
      await new Promise((r) => setTimeout(r, 50))
    }

    // Update final status
    const finalStatus = failed.size > 0 ? "failed" : "completed"
    await prisma.workflowJob.update({
      where: { id: workflowJobId },
      data: {
        status: finalStatus,
        completedCount: completed.size,
        failedCount: failed.size,
        results: this.buildWorkflowResultsPayload(ctx.results, nodeStates),
      },
    })
  }

  /**
   * Wait for a manual node to be completed by the frontend.
   * Returns the result provided, or null if stopped.
   */
  private async waitForManualNode(
    workflowJobId: string,
    nodeId: string,
  ): Promise<Record<string, unknown> | null> {
    while (true) {
      await new Promise((r) => setTimeout(r, CONTROL_POLL_MS))

      // Check global stop
      const ctrl = await this.readControlSignal(workflowJobId)
      if (ctrl === "stop") {
        await this.setSignal(workflowJobId, null, "stopped")
        return null
      }

      // Check node signal
      const wf = await prisma.workflowJob.findUnique({
        where: { id: workflowJobId },
        select: { results: true },
      })

      const rawResults = (wf?.results ?? {}) as Record<string, unknown>
      const workflowMeta = (rawResults.__workflow ?? {}) as Partial<WorkflowMetaState>
      const nodeSignals = workflowMeta.nodeSignals ?? {}
      const signal = nodeSignals[nodeId]

      if (signal?.signal === "manual_complete" || signal?.signal === "manual_skip") {
        // Clear the signal
        const updatedMeta = {
          ...workflowMeta,
          nodeSignals: {
            ...nodeSignals,
            [nodeId]: undefined,
          },
        }
        const updatedResults = { ...rawResults, __workflow: updatedMeta }
        await prisma.workflowJob.update({
          where: { id: workflowJobId },
          data: { results: updatedResults as Prisma.InputJsonValue },
        })

        return (signal.result as Record<string, unknown>) ?? { content: "" }
      }
    }
  }

  /**
   * Signal a manual node completion from the frontend.
   * Called by POST /api/execute/workflow/[id]/nodes/[nodeId]/complete
   */
  async completeManualNode(
    workflowJobId: string,
    nodeId: string,
    action: "complete" | "skip",
    result?: Record<string, unknown>,
  ): Promise<void> {
    const wf = await prisma.workflowJob.findUnique({
      where: { id: workflowJobId },
      select: { results: true },
    })

    const rawResults = (wf?.results ?? {}) as Record<string, unknown>
    const workflowMeta = (rawResults.__workflow ?? {}) as Partial<WorkflowMetaState>
    const nodeSignals = workflowMeta.nodeSignals ?? {}

    const updatedMeta = {
      ...workflowMeta,
      nodeSignals: {
        ...nodeSignals,
        [nodeId]: {
          signal: action === "skip" ? "manual_skip" : "manual_complete",
          result: result ?? { content: "" },
        },
      },
    }

    await prisma.workflowJob.update({
      where: { id: workflowJobId },
      data: {
        results: { ...rawResults, __workflow: updatedMeta } as Prisma.InputJsonValue,
      },
    })
  }

  private buildWorkflowResultsPayload(
    resultsMap: Map<string, unknown>,
    nodeStates: Record<string, WorkflowGateStatus>
  ): Prisma.InputJsonValue {
    return {
      __workflow: {
        nodeStates,
      },
      ...Object.fromEntries(resultsMap),
    } as Prisma.InputJsonValue
  }

  private async persistWorkflowSnapshot(
    ctx: WorkflowExecutionContext,
    nodeStates: Record<string, WorkflowGateStatus>,
    completedCount: number,
    failedCount: number,
  ): Promise<void> {
    await prisma.workflowJob.update({
      where: { id: ctx.workflowJobId },
      data: {
        completedCount,
        failedCount,
        results: this.buildWorkflowResultsPayload(ctx.results, nodeStates),
      },
    })
  }

  /**
   * Build DAG data structures from nodes and edges
   */
  private buildDAG(subgraph: WorkflowSubgraph) {
    const adjacency = new Map<string, string[]>()
    const inDegree = new Map<string, number>()
    const nodeMap = new Map<string, WorkflowNode>()

    // Initialize
    for (const node of subgraph.nodes) {
      nodeMap.set(node.id, node)
      adjacency.set(node.id, [])
      inDegree.set(node.id, 0)
    }

    // Build adjacency and calculate in-degrees
    for (const edge of subgraph.edges) {
      const neighbors = adjacency.get(edge.source) || []
      neighbors.push(edge.target)
      adjacency.set(edge.source, neighbors)

      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    return { adjacency, inDegree, nodeMap }
  }

  /**
   * Execute a single node within the workflow
   */
  private async executeNode(
    ctx: WorkflowExecutionContext,
    node: WorkflowNode,
    allEdges: WorkflowEdge[],
    nodeMap: Map<string, WorkflowNode>,
  ): Promise<{ success: boolean; data?: unknown }> {
    const { workflowJobId, userId, results } = ctx
    const nodeType = node.data.type || node.type

    // ── Pre-resolved external nodes ──────────────────────────────────────────
    if (node.data._preResolved) {
      const d = node.data
      const content = String(d.content ?? d.src ?? d.videoSrc ?? "")
      const result = { content }
      ctx.results.set(node.id, result)
      return { success: true, data: result }
    }

    // Collect inputs from upstream nodes
    const upstreamEdges = allEdges.filter((e) => e.target === node.id)
    const inputs: Record<string, unknown> = {}

    for (const edge of upstreamEdges) {
      const upstreamResult = results.get(edge.source)
      if (upstreamResult) {
        inputs[edge.source] = upstreamResult
      }
    }

    const refEdges = nodeType === "filter"
      ? upstreamEdges.filter((e) => e.targetHandle === "ref")
      : upstreamEdges
    const inEdges = nodeType === "filter"
      ? upstreamEdges.filter((e) => e.targetHandle === "in" || e.targetHandle === "left" || !e.targetHandle)
      : []

    const upstreamData = refEdges.map((edge) => {
      const result = results.get(edge.source) as Record<string, unknown> | undefined
      const srcNode = nodeMap.get(edge.source)
      const upstreamType = (srcNode?.data.type as string) || "text"

      let src: string | undefined
      if (upstreamType === "image" && result) {
        if (result.b64 && result.mime) {
          src = `data:${result.mime};base64,${result.b64}`
        } else if (typeof result.src === "string") {
          src = result.src
        }
      }

      return {
        id: edge.source,
        type: upstreamType,
        content: result && "content" in result ? String(result.content) : "",
        src,
      }
    })

    // Prepare content based on node type
    let content: MultimodalContent[] = []
    let shouldExecuteLLM = true
    let passThroughResult: Record<string, unknown> | null = null

    // ── Filter node ──────────────────────────────────────────────────────────
    if (nodeType === "filter") {
      const prompt         = node.data.prompt || ""
      const filterInputMode = (node.data.filterInputMode as string || "label") as "label" | "content"
      const latestInputOnly = Boolean(node.data.filterLatestInputOnly)
      const selectedIdsLegacy = Array.isArray(node.data.filterSelectedIds)
        ? (node.data.filterSelectedIds as string[]).filter((id): id is string => typeof id === 'string')
        : []
      const outputRules = Array.isArray(node.data.filterOutputRules)
        ? (node.data.filterOutputRules as Array<{ range?: unknown }>).map((r) => ({
            range: String(r?.range ?? '').trim(),
          }))
        : []

      if (inEdges.length === 0) {
        shouldExecuteLLM = false
        passThroughResult = { content: "", filterResult: { passed: [], filtered: [] } }
      } else if (!prompt.trim()) {
        const { items } = await this.buildFilterItems(inEdges, results, nodeMap, filterInputMode)
        shouldExecuteLLM = false

        let selectedByRules: string[] = []
        if (outputRules.length > 0) {
          const selectedIndexSet = new Set<number>()
          for (const rule of outputRules) {
            for (const idx of this.parseIndexExpression(rule.range, items.length)) {
              selectedIndexSet.add(idx)
            }
          }
          if (latestInputOnly && items.length > 0) selectedIndexSet.add(items.length)
          selectedByRules = [...selectedIndexSet]
            .sort((a, b) => a - b)
            .map((idx) => items[idx - 1]?.id)
            .filter((id): id is string => typeof id === 'string')
        }

        const fallbackLatest = latestInputOnly && items.length > 0 ? [items[items.length - 1].id] : []
        const effectiveSelectedIds = selectedByRules.length > 0 || outputRules.length > 0
          ? selectedByRules
          : (selectedIdsLegacy.length > 0 || latestInputOnly ? [...new Set([...selectedIdsLegacy, ...fallbackLatest])] : [])

        const selectedSet = new Set(effectiveSelectedIds)

        const passedItems = items.filter((item) => selectedSet.has(item.id))
        const filteredItems = items.filter((item) => !selectedSet.has(item.id))

        const passedContent = passedItems
          .map((item) => {
            const r = results.get(item.id) as Record<string, unknown> | undefined
            return (r?.content as string) || (r?.src as string) || ''
          })
          .filter(Boolean)
          .join('\n\n')

        passThroughResult = {
          content: passedContent,
          filterResult: {
            passed: passedItems,
            filtered: filteredItems,
          },
        }
      } else {
        const { contentBlocks, items } = await this.buildFilterItems(inEdges, results, nodeMap, filterInputMode)
        const refContent               = await this.resolvePromptWithUpstream(prompt, upstreamData)

        const systemPrompt: MultimodalContent = {
          type: 'text',
          text: `You are a FILTER node in a workflow. Your job is to evaluate items and classify them as PASS or FAIL based on the given condition.

CRITICAL RULES:
1. Respond ONLY with a valid JSON object
2. Format: {"passed":[1,3],"filtered":[2]} where numbers are 1-based indices of items that PASSED the condition
3. Items NOT in "passed" are considered filtered (failed)
4. Be strict - only include items that clearly match the condition
5. Do NOT include any explanation, markdown, or text outside the JSON`
        }

        const conditionHeader: MultimodalContent = { type: 'text', text: '\nCondition:' }
        const instruction: MultimodalContent     = {
          type: 'text',
          text: '\nEvaluate each item. Return ONLY JSON: {"passed":[indices],"filtered":[indices]}',
        }

        content = [systemPrompt, ...contentBlocks, conditionHeader, ...refContent, instruction]
        ;(node.data as Record<string, unknown>)._filterItems = items
      }
    } else if (nodeType === "text" || nodeType === "seed" || nodeType === "pdf") {
      const prompt = node.data.prompt || ""
      const textContent = node.data.content || ""

      if (!prompt.trim()) {
        shouldExecuteLLM = false
        passThroughResult = { content: textContent }
      } else {
        content = await this.resolvePromptWithUpstream(prompt, upstreamData)
      }
    } else if (nodeType === "image") {
      const prompt = node.data.prompt || ""
      content = await this.resolvePromptWithUpstream(prompt, upstreamData)
    } else if (nodeType === "video") {
      const prompt = node.data.prompt || ""
      content = await this.resolvePromptWithUpstream(prompt, upstreamData)
      for (const edge of upstreamEdges) {
        const result = results.get(edge.source)
        if (result && typeof result === "object" && "b64" in result && "mime" in result) {
          content.push({ type: "image_url", image_url: { url: `data:${result.mime};base64,${result.b64}` } })
        }
      }
    } else if (nodeType === "standard") {
      shouldExecuteLLM = false
      passThroughResult = {
        content: node.data.name || node.data.label || "",
        data: node.data
      }
    } else {
      shouldExecuteLLM = false
      passThroughResult = { data: node.data }
    }

    const dependsOn = upstreamEdges.map((e) => e.source)

    // ── Template node: execute pre-instance phase (seed generation) ───────────
    if (nodeType === "template") {
      try {
        const prompt = String(node.data.templatePrompt ?? node.data.prompt ?? "")
        const resolvedPrompt = await this.resolvePromptWithUpstream(prompt, upstreamData)
        const upstreamContent = upstreamData
          .map((u) => u.content)
          .filter(Boolean)
          .join("\n")
        const maxInstances = Number(node.data.templateCount ?? node.data.templateCountLegacy ?? 3)

        const jobResult = await this.jobService.createJob({
          userId,
          nodeId: node.id,
          nodeType,
          content: resolvedPrompt.length > 0 ? resolvedPrompt : [{ type: "text", text: prompt }],
          model: String(node.data.model || DEFAULT_TEXT_MODEL_ID),
          templateParams: {
            maxInstances: Math.max(1, Math.floor(maxInstances)),
            upstreamContent,
          },
        })

        if (!jobResult.success || !jobResult.jobId) {
          return { success: false }
        }

        await prisma.job.update({
          where: { id: jobResult.jobId },
          data: {
            ...(dependsOn.length > 0 && { dependsOn }),
            ...(Object.keys(inputs).length > 0 && { inputData: inputs as Prisma.InputJsonValue }),
            workflowJobId,
          } as Prisma.JobUpdateInput,
        })

        await this.jobService.executeJob(jobResult.jobId, {
          userId,
          nodeType,
          content: resolvedPrompt.length > 0 ? resolvedPrompt : [{ type: "text", text: prompt }],
          model: String(node.data.model || DEFAULT_TEXT_MODEL_ID),
          modelParams: node.data.params as Record<string, string> | undefined,
          templateParams: {
            maxInstances: Math.max(1, Math.floor(maxInstances)),
            upstreamContent,
          },
        })

        const completedJob = await prisma.job.findUnique({ where: { id: jobResult.jobId } })
        if (!completedJob || completedJob.status === "failed") {
          return { success: false }
        }

        return {
          success: true,
          data: (completedJob.result as Record<string, unknown>) ?? { stage: "generating_seeds" },
        }
      } catch (err) {
        console.error(`[WorkflowEngine] Failed to execute template node ${node.id}:`, err)
        return { success: false }
      }
    }

    try {
      if (!shouldExecuteLLM && passThroughResult) {
        const jobResult = await this.jobService.createJob({
          userId,
          nodeId: node.id,
          nodeType,
          content: [{ type: "text", text: "pass-through" }],
          model: node.data.model || "none",
        })

        if (jobResult.success && jobResult.jobId) {
          await prisma.job.update({
            where: { id: jobResult.jobId },
            data: {
              status: "done",
              result: passThroughResult as Prisma.InputJsonValue,
              outputData: passThroughResult as Prisma.InputJsonValue,
              ...(dependsOn.length > 0 && { dependsOn }),
              ...(Object.keys(inputs).length > 0 && { inputData: inputs as Prisma.InputJsonValue }),
              workflowJobId,
            } as Prisma.JobUpdateInput,
          })
        }

        return { success: true, data: passThroughResult }
      }

      const jobResult = await this.jobService.createJob({
        userId,
        nodeId: node.id,
        nodeType,
        content,
        model: node.data.model || DEFAULT_TEXT_MODEL_ID,
      })

      if (!jobResult.success || !jobResult.jobId) {
        return { success: false }
      }

      // Link job to workflow
      await prisma.job.update({
        where: { id: jobResult.jobId },
        data: {
          ...(dependsOn.length > 0 && { dependsOn }),
          ...(Object.keys(inputs).length > 0 && { inputData: inputs as Prisma.InputJsonValue }),
          workflowJobId,
        } as Prisma.JobUpdateInput,
      })

      // Execute the job synchronously for workflow
      await this.jobService.executeJob(jobResult.jobId, {
        userId,
        nodeType,
        content,
        model: node.data.model || DEFAULT_TEXT_MODEL_ID,
        modelParams: node.data.params as Record<string, string> | undefined,
      })

      // Get execution result
      const completedJob = await prisma.job.findUnique({
        where: { id: jobResult.jobId },
      })

      if (completedJob?.status === "done") {
        const outputData = completedJob.result as Record<string, unknown>

        // ── Filter: parse JSON verdict
        let augmented = outputData
        if (nodeType === "filter") {
          const filterItems = (node.data as Record<string, unknown>)._filterItems as
            | Array<{ id: string; label?: string; type?: string }>
            | undefined
          if (filterItems) {
            const rawContent   = (outputData.content as string) || ""
            const filterResult = this.parseFilterResponse(rawContent, filterItems)
            const resolved     = filterResult ?? { passed: filterItems, filtered: [] }

            const passedContent = resolved.passed
              .map((item) => {
                const itemResult = ctx.results.get(item.id) as Record<string, unknown> | undefined
                return (itemResult?.content as string) || (itemResult?.src as string) || ''
              })
              .filter(Boolean)
              .join('\n\n')

            augmented = {
              ...outputData,
              content:      passedContent,
              filterResult: resolved,
            }
          }
        }

        await prisma.job.update({
          where: { id: jobResult.jobId },
          data: {
            outputData: augmented as Prisma.InputJsonValue,
          } as Prisma.JobUpdateInput,
        })

        return { success: true, data: augmented }
      }

      return { success: false }
    } catch (err) {
      console.error(`[WorkflowEngine] Failed to execute node ${node.id}:`, err)
      return { success: false }
    }
  }

  /**
   * Resolve prompt with upstream node references.
   */
  private async resolvePromptWithUpstream(
    prompt: string,
    upstreamData: Array<{ id: string; type: string; content: string; src?: string }>
  ): Promise<MultimodalContent[]> {
    if (!prompt.includes("{{")) {
      return [{ type: "text", text: prompt }]
    }

    const nodeMap = new Map(upstreamData.map((n) => [n.id, n]))
    const result: MultimodalContent[] = []

    const regex = /\{\{([^}]+)\}\}/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(prompt)) !== null) {
      const nodeId = match[1].trim()
      const node = nodeMap.get(nodeId)

      if (match.index > lastIndex) {
        const textBefore = prompt.slice(lastIndex, match.index).trim()
        if (textBefore) {
          result.push({ type: "text", text: textBefore })
        }
      }

      if (node) {
        if (node.type === "image" && node.src) {
          result.push({ type: "image_url", image_url: { url: node.src, detail: "auto" } })
        } else if (node.content) {
          result.push({ type: "text", text: node.content })
        }
      }

      lastIndex = match.index + match[0].length
    }

    if (lastIndex < prompt.length) {
      const textAfter = prompt.slice(lastIndex).trim()
      if (textAfter) {
        result.push({ type: "text", text: textAfter })
      }
    }

    if (result.length === 0) {
      return [{ type: "text", text: prompt }]
    }

    return result
  }

  /**
   * Get workflow execution status
   */
  async getWorkflowStatus(workflowJobId: string) {
    const workflowJob = await prisma.workflowJob.findUnique({
      where: { id: workflowJobId },
      include: { jobs: true },
    })

    if (!workflowJob) {
      return null
    }

    const rawResults = (workflowJob.results ?? {}) as Record<string, unknown>
    const workflowMeta = (rawResults.__workflow ?? {}) as Partial<WorkflowMetaState>
    const nodeStates = (workflowMeta.nodeStates ?? {}) as Record<string, WorkflowGateStatus>

    const nodeStatuses = Object.fromEntries(
      workflowJob.jobs.map((job) => [
        job.nodeId,
        {
          nodeId: job.nodeId,
          nodeType: job.nodeType,
          status: job.status,
          jobId: job.id,
          error: job.error,
          startedAt: job.createdAt,
          completedAt: job.updatedAt,
        },
      ])
    ) as Record<string, {
      nodeId: string
      nodeType: string
      status: string
      jobId: string
      error: string | null
      startedAt: Date
      completedAt: Date
    }>

    for (const [nodeId, gateState] of Object.entries(nodeStates)) {
      if (nodeStatuses[nodeId]) continue
      nodeStatuses[nodeId] = {
        nodeId,
        nodeType: "unknown",
        status: gateState,
        jobId: "",
        error: null,
        startedAt: workflowJob.createdAt,
        completedAt: workflowJob.updatedAt,
      }
    }

    const publicResults = Object.fromEntries(
      Object.entries(rawResults).filter(([key]) => key !== "__workflow")
    )

    return {
      id: workflowJob.id,
      status: workflowJob.status,
      totalNodes: workflowJob.totalNodes,
      completedCount: workflowJob.completedCount,
      failedCount: workflowJob.failedCount,
      results: publicResults,
      error: workflowJob.error,
      nodeStatuses,
      jobs: workflowJob.jobs.map((job) => ({
        id: job.id,
        nodeId: job.nodeId,
        nodeType: job.nodeType,
        status: job.status,
        error: job.error,
      })),
    }
  }
}
