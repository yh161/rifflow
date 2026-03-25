// Workflow DAG Execution Engine

import { prisma } from "@/lib/prisma"
import { JobService } from "./job.service"
import type { MultimodalContent } from "@/lib/prompt-resolver"
import { Prisma } from "@prisma/client"

export interface WorkflowNode {
  id: string
  type: string
  data: {
    type?: string
    content?: string
    prompt?: string
    model?: string
    params?: Record<string, string>
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

export interface WorkflowExecutionContext {
  workflowJobId: string
  userId: string
  results: Map<string, unknown>
}

/**
 * DAG-based Workflow Execution Engine
 * 
 * Core algorithm:
 * 1. Build adjacency list and in-degree map from edges
 * 2. Find all source nodes (in-degree = 0)
 * 3. Execute source nodes in parallel
 * 4. When a node completes, decrement in-degree of its neighbors
 * 5. New source nodes (in-degree = 0) join the execution queue
 * 6. Repeat until all nodes are processed
 */
export class WorkflowEngine {
  private jobService: JobService

  constructor(jobService?: JobService) {
    this.jobService = jobService || new JobService()
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
    const workflowJob = await prisma.workflowJob.create({
      data: {
        userId,
        status: "pending",
        totalNodes: subgraph.nodes.length,
        completedCount: 0,
        failedCount: 0,
        results: {},
      },
    })

    const workflowJobId = workflowJob.id

    // 2. Initialize execution context
    const ctx: WorkflowExecutionContext = {
      workflowJobId,
      userId,
      results: new Map(),
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

  /**
   * Core DAG execution algorithm
   */
  private async runExecution(
    ctx: WorkflowExecutionContext,
    subgraph: WorkflowSubgraph,
    entryData?: Record<string, unknown>
  ): Promise<void> {
    const { workflowJobId, userId } = ctx

    // Build DAG structures
    const { adjacency, inDegree, nodeMap } = this.buildDAG(subgraph)

    // Update status to running
    await prisma.workflowJob.update({
      where: { id: workflowJobId },
      data: { status: "running" },
    })

    // Initialize with source nodes (in-degree = 0)
    const queue: string[] = []
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(nodeId)
    }

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
      // Start new executions (limited concurrency)
      while (queue.length > 0 && executing.size < 5) {
        const nodeId = queue.shift()!
        const node = nodeMap.get(nodeId)
        if (!node) continue

        executing.add(nodeId)
        
        // Execute node asynchronously
        this.executeNode(ctx, node, subgraph.edges, nodeMap).then((result) => {
          executing.delete(nodeId)
          
          if (result.success) {
            completed.add(nodeId)
            ctx.results.set(nodeId, result.data)
            
            // Update in-degrees and add new sources to queue
            const neighbors = adjacency.get(nodeId) || []
            for (const neighborId of neighbors) {
              const newDegree = (inDegree.get(neighborId) || 0) - 1
              inDegree.set(neighborId, newDegree)
              if (newDegree === 0) {
                queue.push(neighborId)
              }
            }
          } else {
            console.error(`[WorkflowEngine] Node ${nodeId} execution failed:`, (result as any).error || "Unknown error")
            failed.add(nodeId)
          }
        }).catch((err) => {
          console.error(`[WorkflowEngine] Node ${nodeId} execution error:`, err)
          executing.delete(nodeId)
          failed.add(nodeId)
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
        results: Object.fromEntries(ctx.results) as Prisma.InputJsonValue,
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
    // Nodes tagged _preResolved come from outside the batch container.
    // Their existing content is already the correct value — skip LLM execution
    // and register the result immediately so downstream nodes can reference them.
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

    // Separate ref vs in edges for filter; for all others use all edges as ref.
    // inEdges: match 'in', 'left', null, or undefined — keeps parity with useConnectedSources on the frontend
    const refEdges = nodeType === "filter"
      ? upstreamEdges.filter((e) => e.targetHandle === "ref")
      : upstreamEdges
    const inEdges = nodeType === "filter"
      ? upstreamEdges.filter((e) => e.targetHandle === "in" || e.targetHandle === "left" || !e.targetHandle)
      : []

    // Build upstream data for prompt resolution (REF edges only)
    const upstreamData = refEdges.map((edge) => {
      const result = results.get(edge.source)
      return {
        id: edge.source,
        type: "text" as const,
        content: result && typeof result === "object" && "content" in result
          ? String(result.content)
          : String(result || ""),
      }
    })

    // Prepare content based on node type
    let content: MultimodalContent[] = []
    let shouldExecuteLLM = true
    let passThroughResult: Record<string, unknown> | null = null

    // ── Filter node — special execution path ────────────────────────────────
    if (nodeType === "filter") {
      const prompt         = node.data.prompt || ""
      const filterInputMode = (node.data.filterInputMode as string || "label") as "label" | "content"

      // No IN items → pass through with empty result
      if (inEdges.length === 0) {
        shouldExecuteLLM = false
        passThroughResult = { content: "", filterResult: { passed: [], filtered: [] } }
      } else if (!prompt.trim()) {
        // No condition → pass all through
        const { items } = await this.buildFilterItems(inEdges, results, nodeMap, filterInputMode)
        shouldExecuteLLM = false
        // Compute joined content of all passed items (same logic as LLM path)
        const passedContent = items
          .map((item) => {
            const r = results.get(item.id) as Record<string, unknown> | undefined
            return (r?.content as string) || (r?.src as string) || ''
          })
          .filter(Boolean)
          .join('\n\n')
        passThroughResult = { content: passedContent, filterResult: { passed: items, filtered: [] } }
      } else {
        // Build IN items + resolve REF condition → combined prompt
        const { contentBlocks, items } = await this.buildFilterItems(inEdges, results, nodeMap, filterInputMode)
        const refContent               = await this.resolvePromptWithUpstream(prompt, upstreamData)

        // System prompt to guide the LLM as a filter
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

        // Add system prompt at the beginning
        content = [systemPrompt, ...contentBlocks, conditionHeader, ...refContent, instruction]

        // After LLM executes we need `items` to parse the response.
        // Store on the node data temporarily so the post-execution block can use it.
        ;(node.data as Record<string, unknown>)._filterItems = items
      }
    } else if (nodeType === "text" || nodeType === "seed") {
      const prompt = node.data.prompt || ""
      const textContent = node.data.content || ""

      if (!prompt.trim()) {
        // No prompt - don't execute LLM, pass through content as output
        shouldExecuteLLM = false
        passThroughResult = { content: textContent }
      } else {
        // Has prompt - resolve any {{nodeId}} references and execute LLM
        content = await this.resolvePromptWithUpstream(prompt, upstreamData)
      }
    } else if (nodeType === "image") {
      const prompt = node.data.prompt || ""
      // Resolve any {{nodeId}} references in the prompt
      content = await this.resolvePromptWithUpstream(prompt, upstreamData)
    } else if (nodeType === "video") {
      const prompt = node.data.prompt || ""
      // Resolve any {{nodeId}} references in the prompt
      content = await this.resolvePromptWithUpstream(prompt, upstreamData)
    } else if (nodeType === "standard") {
      // Standard nodes pass through their name/label as content
      shouldExecuteLLM = false
      passThroughResult = { 
        content: node.data.name || node.data.label || "",
        data: node.data 
      }
    } else {
      // Default: pass through
      shouldExecuteLLM = false
      passThroughResult = { data: node.data }
    }

    // Create job record for tracking
    const dependsOn = upstreamEdges.map((e) => e.source)
    
    try {
      // If no LLM execution needed, return pass-through result directly
      if (!shouldExecuteLLM && passThroughResult) {
        // Still create a job record for tracking (marked as done immediately)
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

      // Execute using existing JobService
      const jobResult = await this.jobService.createJob({
        userId,
        nodeId: node.id,
        nodeType,
        content,
        model: node.data.model || "gemini-2.0-flash",
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
        model: node.data.model || "gemini-2.0-flash",
      })

      // Get execution result
      const completedJob = await prisma.job.findUnique({
        where: { id: jobResult.jobId },
      })

      if (completedJob?.status === "done") {
        const outputData = completedJob.result as Record<string, unknown>

        // ── Filter: parse JSON verdict and attach filterResult + output content
        let augmented = outputData
        if (nodeType === "filter") {
          const filterItems = (node.data as Record<string, unknown>)._filterItems as
            | Array<{ id: string; label?: string; type?: string }>
            | undefined
          if (filterItems) {
            const rawContent   = (outputData.content as string) || ""
            const filterResult = this.parseFilterResponse(rawContent, filterItems)
            const resolved     = filterResult ?? { passed: filterItems, filtered: [] }

            // Compute output content = joined content of passed nodes
            // Downstream nodes referencing this filter get this value
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

        // Update job with output
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
   * Resolve prompt with upstream node references
   * Replaces {{nodeId}} with actual content from upstream nodes
   */
  private async resolvePromptWithUpstream(
    prompt: string,
    upstreamData: Array<{ id: string; type: string; content: string }>
  ): Promise<MultimodalContent[]> {
    if (!prompt.includes("{{")) {
      // No references, return prompt as-is
      return [{ type: "text", text: prompt }]
    }

    const nodeMap = new Map(upstreamData.map((n) => [n.id, n]))
    const result: MultimodalContent[] = []

    // Find all {{nodeId}} references
    const regex = /\{\{([^}]+)\}\}/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(prompt)) !== null) {
      const nodeId = match[1].trim()
      const node = nodeMap.get(nodeId)

      // Add text before the reference
      if (match.index > lastIndex) {
        const textBefore = prompt.slice(lastIndex, match.index).trim()
        if (textBefore) {
          result.push({ type: "text", text: textBefore })
        }
      }

      // Add the upstream node content
      if (node && node.content) {
        result.push({ type: "text", text: node.content })
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text after last reference
    if (lastIndex < prompt.length) {
      const textAfter = prompt.slice(lastIndex).trim()
      if (textAfter) {
        result.push({ type: "text", text: textAfter })
      }
    }

    // If no references were resolved, return the original prompt
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

    return {
      id: workflowJob.id,
      status: workflowJob.status,
      totalNodes: workflowJob.totalNodes,
      completedCount: workflowJob.completedCount,
      failedCount: workflowJob.failedCount,
      results: workflowJob.results as Record<string, unknown>,
      error: workflowJob.error,
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