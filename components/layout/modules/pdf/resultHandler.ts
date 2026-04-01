import type { ResultHandlerContext } from '../_registry'
import type { CustomNodeData } from '../_types'
import { buildPdfOutputsFromPages, revokeBlobUrls } from './render'
import { parsePdfPlanFromText, resolvePdfOutputPagesWithCurrent, type PdfOutputRule } from '@/lib/pdf-transfer'

interface PdfResultPayload {
  content?: unknown
  pdfOutputRules?: unknown
  pdfPlanError?: unknown
}

export async function resultHandler(
  result: Record<string, unknown>,
  ctx: ResultHandlerContext,
): Promise<void> {
  const payload = result as PdfResultPayload
  const nodes = ctx.getNodes()
  const node = nodes.find((n) => n.id === ctx.nodeId)
  const data = node?.data as (CustomNodeData & { generationCount?: number }) | undefined

  const parsed = Array.isArray(payload.pdfOutputRules)
    ? {
        rules: payload.pdfOutputRules as PdfOutputRule[],
        error: typeof payload.pdfPlanError === 'string' ? payload.pdfPlanError : undefined,
      }
    : parsePdfPlanFromText(String(payload.content ?? ''))

  const nextBase = {
    content: payload.content,
    pdfOutputRules: parsed.rules,
    pdfPlanRaw: String(payload.content ?? ''),
    pdfPlanError: parsed.error,
    isGenerating: false,
    activeJobId: undefined,
    generationCount: (data?.generationCount ?? 0) + 1,
  }

  if (!data?.pdfSrc || parsed.rules.length === 0) {
    const resolved = resolvePdfOutputPagesWithCurrent(parsed.rules, data?.pdfPageCount, {
      includeCurrentPage: Boolean(data?.pdfIncludeCurrentPage),
      currentPage: data?.pdfCurrentPage,
      currentPageDpi: data?.pdfIncludeCurrentPageDpi,
    })

    if (!data?.pdfSrc || resolved.length === 0) {
      ctx.setNodes((ns) => ns.map((n) => n.id !== ctx.nodeId ? n : { ...n, data: { ...n.data, ...nextBase } }))
      return
    }

    try {
      const oldUrls = data.pdfOutputImages ?? []
      const { images, pages, summary } = await buildPdfOutputsFromPages(data.pdfSrc, resolved)
      revokeBlobUrls(oldUrls)
      ctx.setNodes((ns) => ns.map((n) => n.id !== ctx.nodeId ? n : {
        ...n,
        data: {
          ...n.data,
          ...nextBase,
          content: summary,
          pdfOutputImages: images,
          pdfOutputPageNums: pages,
          pdfPlanError: undefined,
        },
      }))
    } catch (err) {
      ctx.setNodes((ns) => ns.map((n) => n.id !== ctx.nodeId ? n : {
        ...n,
        data: {
          ...n.data,
          ...nextBase,
          pdfPlanError: err instanceof Error ? err.message : 'Failed to render PDF outputs',
        },
      }))
    }
    return
  }

  try {
    const resolved = resolvePdfOutputPagesWithCurrent(parsed.rules, data.pdfPageCount, {
      includeCurrentPage: Boolean(data.pdfIncludeCurrentPage),
      currentPage: data.pdfCurrentPage,
      currentPageDpi: data.pdfIncludeCurrentPageDpi,
    })
    const oldUrls = data.pdfOutputImages ?? []
    const { images, pages, summary } = await buildPdfOutputsFromPages(data.pdfSrc, resolved)
    revokeBlobUrls(oldUrls)
    ctx.setNodes((ns) => ns.map((n) => n.id !== ctx.nodeId ? n : {
      ...n,
      data: {
        ...n.data,
        ...nextBase,
        content: summary,
        pdfOutputImages: images,
        pdfOutputPageNums: pages,
        pdfPlanError: undefined,
      },
    }))
  } catch (err) {
    ctx.setNodes((ns) => ns.map((n) => n.id !== ctx.nodeId ? n : {
      ...n,
      data: {
        ...n.data,
        ...nextBase,
        pdfPlanError: err instanceof Error ? err.message : 'Failed to render PDF outputs',
      },
    }))
  }
}
