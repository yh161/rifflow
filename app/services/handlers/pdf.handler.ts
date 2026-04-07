import { parsePdfPlanFromText } from "@/lib/pdf-transfer"
import type { JobHandler } from "./types"
import { executeTextGeneration } from "./text.handler"
import type { MultimodalContent } from "@/lib/prompt-resolver"

export const pdfHandler: JobHandler = {
  async execute({ content, model, modelParams }, ctx) {
    // Extract PDF page count passed from frontend via reserved modelParams key
    const pdfPageCount = modelParams?.__pdfPageCount
      ? parseInt(modelParams.__pdfPageCount, 10)
      : undefined
    const cleanParams = { ...modelParams }
    delete cleanParams.__pdfPageCount

    // Pull user text out of multimodal content
    const userText = content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: string; text: string }).text)
      .join('\n')
      .trim()

    // Wrap with system instruction so LLM always returns JSON
    const lines = [
      'You are a PDF page-range planner.',
      pdfPageCount ? `The PDF has ${pdfPageCount} pages total.` : '',
      `User instruction: ${userText}`,
      '',
      'Respond ONLY with valid JSON — no explanation, no markdown fences:',
      '{"outputs": [{"pages": "1-10", "dpi": 72}, {"pages": "11-20", "dpi": 72}]}',
      'pages is a range string like "1-10"; dpi is an integer 72-600.',
    ].filter(Boolean)

    const wrappedContent: MultimodalContent[] = [
      { type: 'text', text: lines.join('\n') },
    ]

    const result = await executeTextGeneration(wrappedContent, model, cleanParams, ctx)
    const parsed = parsePdfPlanFromText(result.content)
    return {
      jobResult: {
        content: result.content,
        pdfAiRules: parsed.rules,  // AI rules stored separately; pdfOutputRules (manual) untouched
        ...(parsed.error ? { pdfPlanError: parsed.error } : {}),
      },
      inputTokens: result._inputTokens,
      outputTokens: result._outputTokens,
    }
  },
}
