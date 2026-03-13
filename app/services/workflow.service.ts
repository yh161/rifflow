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
        this.executeNode(ctx, node, subgraph.edges).then((result) => {
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
    allEdges: WorkflowEdge[]
  ): Promise<{ success: boolean; data?: unknown }> {
    const { workflowJobId, userId, results } = ctx
    const nodeType = node.data.type || node.type

    // Collect inputs from upstream nodes
    const upstreamEdges = allEdges.filter((e) => e.target === node.id)
    const inputs: Record<string, unknown> = {}
    
    for (const edge of upstreamEdges) {
      const upstreamResult = results.get(edge.source)
      if (upstreamResult) {
        inputs[edge.source] = upstreamResult
      }
    }

    // Build upstream data for prompt resolution
    const upstreamData = upstreamEdges.map((edge) => {
      const result = results.get(edge.source)
      return {
        id: edge.source,
        type: "text" as const, // Simplified - could be inferred from node type
        content: result && typeof result === "object" && "content" in result 
          ? String(result.content) 
          : String(result || ""),
      }
    })

    // Prepare content based on node type
    let content: MultimodalContent[] = []
    let shouldExecuteLLM = true
    let passThroughResult: Record<string, unknown> | null = null
    
    if (nodeType === "text" || nodeType === "gate") {
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
        
        // Update job with output
        await prisma.job.update({
          where: { id: jobResult.jobId },
          data: { 
            outputData: outputData as Prisma.InputJsonValue 
          } as Prisma.JobUpdateInput,
        })

        return { success: true, data: outputData }
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