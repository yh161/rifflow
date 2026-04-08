// Job service layer — thin dispatcher using per-module handlers

import { JobRepository } from "@/app/repositories/job.repository"
import { WalletRepository } from "@/app/repositories/wallet.repository"
import { ExecutionLogRepository } from "@/app/repositories/executionLog.repository"
import { IJobRepository } from "@/app/repositories/types"
import { calculateCreditCost } from "@/lib/credits"
import type { MultimodalContent } from "@/lib/prompt-resolver"
import { Prisma } from "@prisma/client"
import { HANDLER_BY_TYPE } from "./handlers"
import type { HandlerContext } from "./handlers"

export interface TemplateParams {
  maxInstances: number
  upstreamContent?: string
}

export interface FilterItemParam {
  id: string
  label?: string
  type?: string
}

export interface JobCreationParams {
  userId: string
  nodeId: string
  nodeType: string
  content: MultimodalContent[]
  model: string
  modelParams?: Record<string, string>
  templateParams?: TemplateParams
  filterItems?: FilterItemParam[]
  /** Resolved image slot URLs for video models: API param key → URL or URL[] */
  imageSlots?: Record<string, string | string[]>
}

// ── Shared result shape for template jobs (stored in job.result) ──────────────
export interface TemplateJobResult {
  stage: 'generating_seeds' | 'seeds_ready' | 'executing_workflows' | 'done'
  templateParams?: TemplateParams
  seeds?: Array<{ content: string; description?: string }>
  workflowProgress?: { current: number; total: number }
  workflowJobIds?: string[]
  workflowNodeStatuses?: Record<string, {
    nodeId: string
    nodeType?: string
    status?: string
    jobId?: string
    error?: string | null
  }>
  workflowSummary?: {
    queued: number
    running: number
    completed: number
    failed: number
    total: number
  }
  instanceResults?: Record<string, unknown>
}

export interface JobExecutionResult {
  success: boolean
  jobId?: string
  error?: string
  result?: unknown
}

export class JobService {
  private jobRepository: IJobRepository
  private walletRepository: WalletRepository
  private executionLogRepository: ExecutionLogRepository

  constructor(
    jobRepository?: IJobRepository,
    walletRepository?: WalletRepository,
    executionLogRepository?: ExecutionLogRepository
  ) {
    this.jobRepository = jobRepository || new JobRepository()
    this.walletRepository = walletRepository || new WalletRepository()
    this.executionLogRepository = executionLogRepository || new ExecutionLogRepository()
  }

  async createJob(params: JobCreationParams): Promise<JobExecutionResult> {
    try {
      const { userId, nodeId, nodeType, content, model } = params
      const cost = calculateCreditCost(model, params.modelParams)

      // Check user's credits
      const wallet = await this.walletRepository.findByUserId(userId)
      if (!wallet || wallet.points < cost) {
        return {
          success: false,
          error: "Insufficient credits"
        }
      }

      // Create job record (for template, seed initial result so params survive restarts)
      const initialResult =
        nodeType === 'template' && params.templateParams
          ? { stage: 'generating_seeds', templateParams: params.templateParams } as unknown as Prisma.InputJsonValue
          : undefined

      const job = await this.jobRepository.create({
        user: { connect: { id: userId } },
        nodeId,
        nodeType,
        status: "pending",
        ...(initialResult !== undefined && { result: initialResult }),
      })

      return {
        success: true,
        jobId: job.id
      }
    } catch (error: unknown) {
      console.error("[JobService] createJob failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      }
    }
  }

  async executeJob(jobId: string, params: Omit<JobCreationParams, 'nodeId'>): Promise<void> {
    try {
      const { userId, nodeType, content, model } = params

      const handler = HANDLER_BY_TYPE[nodeType]
      if (!handler) {
        throw new Error(`No handler registered for nodeType "${nodeType}"`)
      }

      const ctx: HandlerContext = {
        getBaseHeaders: () => this.getBaseHeaders(),
        jobRepository: this.jobRepository,
        walletRepository: this.walletRepository,
        executionLogRepository: this.executionLogRepository,
      }

      const result = await handler.execute({
        jobId,
        userId,
        content,
        model,
        modelParams: params.modelParams,
        extra: {
          templateParams: params.templateParams,
          filterItems:    params.filterItems,
          imageSlots:     params.imageSlots,
        },
      }, ctx)

      // Self-managed handlers (template, filter) handle their own status/credits
      if (result.selfManaged) return

      // Standard handlers: deduct credits, log, and store result
      const cost = calculateCreditCost(model, params.modelParams)

      await this.walletRepository.updateBalance(userId, -cost)

      await this.executionLogRepository.create({
        userId,
        nodeType,
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0,
        creditCost: cost,
        status: "SUCCESS"
      })

      await this.jobRepository.updateStatus(jobId, "done", result.jobResult)

    } catch (error: unknown) {
      console.error("[JobService] executeJob failed:", error)
      await this.jobRepository.updateStatus(
        jobId,
        "failed",
        undefined,
        error instanceof Error ? error.message : "Unknown error"
      )
    }
  }

  private getBaseHeaders() {
    return {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000"
    }
  }

  async getJobById(jobId: string) {
    return this.jobRepository.findById(jobId)
  }

  async getUserJobs(userId: string, status?: string) {
    return this.jobRepository.findByUserId(userId, status)
  }
}
