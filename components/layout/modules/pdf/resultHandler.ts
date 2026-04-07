import type { ResultHandlerContext } from '../_registry'
import type { CustomNodeData } from '../_types'
import { buildPdfOutputsFromPages, revokeBlobUrls } from './render'
import {
  clampDpi,
  parsePdfPlanFromText,
  resolvePdfOutputPages,
  type PdfOutputRule,
  type PdfOutputPage,
} from '@/lib/pdf-transfer'

interface PdfResultPayload {
  content?: unknown
  pdfAiRules?: unknown   // AI rules (new field from pdf.handler)
  pdfPlanError?: unknown
}

/**
 * Merge manual rules + AI rules + optional current-page override into a
 * single PdfOutputPage[]. Manual rules win on DPI conflicts.
 */
function getMergedResolved(
  manualRules: PdfOutputRule[],
  aiRules: PdfOutputRule[],
  pageCount: number | undefined,
  options: {
    includeCurrentPage?: boolean
    currentPage?: number
    currentPageDpi?: number
  },
): PdfOutputPage[] {
  const map = new Map<number, number>()
  for (const p of resolvePdfOutputPages(aiRules, pageCount)) map.set(p.page, p.dpi)
  for (const p of resolvePdfOutputPages(manualRules, pageCount)) map.set(p.page, p.dpi)
  if (options.includeCurrentPage) {
    const maxP = Math.max(pageCount ?? 1, 1)
    const cur = Math.min(Math.max(Math.round(options.currentPage ?? 1), 1), maxP)
    map.set(cur, clampDpi(options.currentPageDpi))
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, dpi]) => ({ page, dpi }))
}

export async function resultHandler(
  result: Record<string, unknown>,
  ctx: ResultHandlerContext,
): Promise<void> {
  const payload = result as PdfResultPayload
  const nodes = ctx.getNodes()
  const node = nodes.find((n) => n.id === ctx.nodeId)
  const data = node?.data as (CustomNodeData & { generationCount?: number }) | undefined

  // Parse AI rules from the new pdfAiRules field; fall back to parsing content for legacy payloads
  let aiRules: PdfOutputRule[]
  let parseError: string | undefined
  if (Array.isArray(payload.pdfAiRules)) {
    aiRules = payload.pdfAiRules as PdfOutputRule[]
    parseError = typeof payload.pdfPlanError === 'string' ? payload.pdfPlanError : undefined
  } else {
    const fallback = parsePdfPlanFromText(String(payload.content ?? ''))
    aiRules = fallback.rules
    parseError = fallback.error
  }

  // Manual rules from node data — never overwritten by AI
  const manualRules: PdfOutputRule[] = Array.isArray(data?.pdfOutputRules)
    ? (data.pdfOutputRules as PdfOutputRule[])
    : []

  // Base update: store new AI rules + mark done; pdfOutputRules (manual) intentionally omitted
  const nextBase = {
    content: payload.content,
    pdfAiRules: aiRules,
    pdfPlanRaw: String(payload.content ?? ''),
    pdfPlanError: parseError,
    done: true,
    isGenerating: false,
    activeJobId: undefined,
    generationCount: (data?.generationCount ?? 0) + 1,
  }

  const resolveOptions = {
    includeCurrentPage: Boolean(data?.pdfIncludeCurrentPage),
    currentPage: data?.pdfCurrentPage,
    currentPageDpi: data?.pdfIncludeCurrentPageDpi,
  }

  if (!data?.pdfSrc) {
    ctx.setNodes((ns) =>
      ns.map((n) =>
        n.id !== ctx.nodeId ? n : { ...n, data: { ...n.data, ...nextBase } },
      ),
    )
    return
  }

  const resolved = getMergedResolved(manualRules, aiRules, data.pdfPageCount, resolveOptions)

  if (resolved.length === 0) {
    ctx.setNodes((ns) =>
      ns.map((n) =>
        n.id !== ctx.nodeId ? n : { ...n, data: { ...n.data, ...nextBase } },
      ),
    )
    return
  }

  try {
    const oldUrls = data.pdfOutputImages ?? []
    const { images, pages, summary } = await buildPdfOutputsFromPages(data.pdfSrc, resolved)
    revokeBlobUrls(oldUrls)
    ctx.setNodes((ns) =>
      ns.map((n) =>
        n.id !== ctx.nodeId
          ? n
          : {
              ...n,
              data: {
                ...n.data,
                ...nextBase,
                content: summary,
                pdfOutputImages: images,
                pdfOutputPageNums: pages,
                pdfPlanError: undefined,
              },
            },
      ),
    )
  } catch (err) {
    ctx.setNodes((ns) =>
      ns.map((n) =>
        n.id !== ctx.nodeId
          ? n
          : {
              ...n,
              data: {
                ...n.data,
                ...nextBase,
                pdfPlanError: err instanceof Error ? err.message : 'Failed to render PDF outputs',
              },
            },
      ),
    )
  }
}
