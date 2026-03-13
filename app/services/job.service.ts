// Job service layer

import { JobRepository } from "@/app/repositories/job.repository"
import { WalletRepository } from "@/app/repositories/wallet.repository"
import { ExecutionLogRepository } from "@/app/repositories/executionLog.repository"
import { IJobRepository } from "@/app/repositories/types"
import { CREDIT_COST, TEXT_MODEL_MAP, IMAGE_MODEL_MAP } from "./constants"

export interface JobCreationParams {
  userId: string
  nodeId: string
  nodeType: string
  prompt: string
  model: string
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
      const { userId, nodeId, nodeType, prompt, model } = params
      const cost = CREDIT_COST[nodeType] ?? 1

      // Check user's credits
      const wallet = await this.walletRepository.findByUserId(userId)
      if (!wallet || wallet.points < cost) {
        return {
          success: false,
          error: "Insufficient credits"
        }
      }

      // Create job record
      const job = await this.jobRepository.create({
        user: { connect: { id: userId } },
        nodeId,
        nodeType,
        status: "pending"
      })

      // Return job ID immediately (fire-and-forget)
      // Actual execution will happen asynchronously
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
      const { userId, nodeType, prompt, model } = params
      const cost = CREDIT_COST[nodeType] ?? 1

      // Update job status to running
      await this.jobRepository.updateStatus(jobId, "running")

      let result: TextGenerationResult | ImageGenerationResult

      if (nodeType === "image") {
        result = await this.executeImageGeneration(prompt, model)
      } else {
        result = await this.executeTextGeneration(nodeType, prompt, model)
      }

      // Deduct credits and log execution
      await this.walletRepository.updateBalance(userId, -cost)
      
      await this.executionLogRepository.create({
        userId,
        nodeType,
        inputTokens: result._inputTokens || 0,
        outputTokens: result._outputTokens || 0,
        creditCost: cost,
        status: "SUCCESS"
      })

      // Update job with result
      const jobResult = nodeType === "image"
        ? { b64: (result as ImageGenerationResult).b64, mime: (result as ImageGenerationResult).mime }
        : { content: (result as TextGenerationResult).content }

      await this.jobRepository.updateStatus(jobId, "done", jobResult)

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

  private async executeTextGeneration(nodeType: string, prompt: string, model: string): Promise<TextGenerationResult> {
    const orModel = TEXT_MODEL_MAP[model] ?? "google/gemini-2.0-flash-001"
    
    const headers = this.getBaseHeaders()
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: orModel,
        messages: [{ role: "user", content: prompt }]
      })
    })

    if (!response.ok) {
      throw new Error(`Text model error (${response.status}): ${await response.text()}`)
    }

    const data = await response.json() as OpenRouterResponse
    return {
      content: data.choices?.[0]?.message?.content || "",
      _inputTokens: data.usage?.prompt_tokens || 0,
      _outputTokens: data.usage?.completion_tokens || 0
    }
  }

  private async executeImageGeneration(prompt: string, model: string): Promise<ImageGenerationResult> {
    const modelDef = IMAGE_MODEL_MAP[model] ?? IMAGE_MODEL_MAP["seedream-4.5"]
    
    const headers = this.getBaseHeaders()
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelDef.id,
        modalities: modelDef.modalities,
        messages: [
          {
            role: "system",
            content: "You are an image generation assistant. Always generate an image directly based on the user's description. Never ask for clarification."
          },
          { role: "user", content: prompt }
        ]
      })
    })

    const rawText = await response.text()
    if (!response.ok) {
      throw new Error(`Image model error (${response.status}): ${rawText.slice(0, 300)}`)
    }

    const data = JSON.parse(rawText) as OpenRouterResponse
    const message = data.choices?.[0]?.message

    let dataUrl: string | undefined
    if (Array.isArray(message?.images) && message.images.length > 0) {
      dataUrl = message.images[0]?.image_url?.url ?? message.images[0]?.imageUrl?.url
    }
    if (!dataUrl) {
      const blocks = Array.isArray(message?.content) ? message.content : []
      const imgBlock = blocks.find((b: { type?: string; image_url?: { url?: string } }) => b.type === "image_url")
      dataUrl = imgBlock?.image_url?.url
    }
    if (!dataUrl) {
      throw new Error("Model returned text instead of an image — try a more descriptive prompt.")
    }

    const commaIdx = dataUrl.indexOf(",")
    const b64 = dataUrl.slice(commaIdx + 1)
    const mime = dataUrl.slice(0, commaIdx).replace("data:", "").replace(";base64", "") || "image/png"

    return { b64, mime, _inputTokens: 0, _outputTokens: 0 }
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

interface TextGenerationResult {
  content: string
  _inputTokens: number
  _outputTokens: number
}

interface ImageGenerationResult {
  b64: string
  mime: string
  _inputTokens: number
  _outputTokens: number
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string
      images?: Array<{ image_url?: { url?: string }; imageUrl?: { url?: string } }>
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}
