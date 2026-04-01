import { parsePdfPlanFromText } from "@/lib/pdf-transfer"
import type { JobHandler } from "./types"
import { executeTextGeneration } from "./text.handler"

export const pdfHandler: JobHandler = {
  async execute({ content, model, modelParams }, ctx) {
    const result = await executeTextGeneration(content, model, modelParams, ctx)
    const parsed = parsePdfPlanFromText(result.content)
    return {
      jobResult: {
        content: result.content,
        pdfOutputRules: parsed.rules,
        ...(parsed.error ? { pdfPlanError: parsed.error } : {}),
      },
      inputTokens: result._inputTokens,
      outputTokens: result._outputTokens,
    }
  },
}
