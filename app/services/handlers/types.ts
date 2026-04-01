// Shared types for all backend job handlers

import type { MultimodalContent } from "@/lib/prompt-resolver"
import type { IJobRepository } from "@/app/repositories/types"
import type { WalletRepository } from "@/app/repositories/wallet.repository"
import type { ExecutionLogRepository } from "@/app/repositories/executionLog.repository"

// ── Generation results ──────────────────────────────────────────────────────

export interface TextGenerationResult {
  content: string
  _inputTokens: number
  _outputTokens: number
}

export interface ImageGenerationResult {
  b64: string
  mime: string
  _inputTokens: number
  _outputTokens: number
}

export interface VideoGenerationResult {
  videoSrc: string
  _inputTokens: number
  _outputTokens: number
}

// ── Handler context — shared dependencies injected by JobService ────────────

export interface HandlerContext {
  getBaseHeaders: () => Record<string, string>
  jobRepository: IJobRepository
  walletRepository: WalletRepository
  executionLogRepository: ExecutionLogRepository
}

// ── Handler interface ───────────────────────────────────────────────────────
// Each nodeType handler implements `execute` which runs the generation
// and returns the job result to store in the DB.

export interface JobHandler {
  /**
   * Execute the generation for this node type.
   * For simple types (text/image/video): runs generation, returns job result.
   * For complex types (template/filter): manages full lifecycle including
   * status updates, credit deduction, and result storage.
   */
  execute(params: {
    jobId: string
    userId: string
    content: MultimodalContent[]
    model: string
    modelParams?: Record<string, string>
    /** Extra params (e.g. templateParams, filterItems) */
    extra?: Record<string, any>
  }, ctx: HandlerContext): Promise<{
    /** Job result to store. If undefined, handler already stored it. */
    jobResult?: Record<string, unknown>
    /** Whether handler managed its own job lifecycle (status, credits). */
    selfManaged?: boolean
    inputTokens?: number
    outputTokens?: number
  }>
}
