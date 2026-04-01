import { clampDpi, resolvePdfOutputPages, type PdfOutputPage, type PdfOutputRule } from "@/lib/pdf-transfer"
import type { PDFDocumentProxy } from "pdfjs-dist"

let workerReady: Promise<void> | null = null

async function ensureWorker(): Promise<void> {
  if (!workerReady) {
    workerReady = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString()
    })
  }
  return workerReady
}

async function renderPageWithDoc(pdf: PDFDocumentProxy, pageNumber: number, dpi: number): Promise<string> {
  const safePage = Math.max(1, Math.min(pageNumber, pdf.numPages))
  const page = await pdf.getPage(safePage)
  const viewport = page.getViewport({ scale: clampDpi(dpi) / 72 })

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")

  await page.render({ canvas, canvasContext: ctx, viewport }).promise

  return canvas.toDataURL("image/jpeg", 0.92)
}

// Kept for single-page standalone use (loads + destroys its own doc)
export async function renderPdfPageAtDpi(src: string, pageNumber: number, dpi: number): Promise<string> {
  await ensureWorker()
  const pdfjs = await import("pdfjs-dist")
  const pdf = await pdfjs.getDocument(src).promise
  try {
    return await renderPageWithDoc(pdf, pageNumber, dpi)
  } finally {
    pdf.destroy()
  }
}

export function revokeBlobUrls(urls: string[] | undefined) {
  for (const url of urls ?? []) {
    if (url?.startsWith("blob:")) {
      try { URL.revokeObjectURL(url) } catch {}
    }
  }
}

export async function buildPdfOutputsFromPages(
  src: string,
  pages: PdfOutputPage[],
): Promise<{ images: string[]; pages: number[]; summary: string }> {
  if (pages.length === 0) {
    return { images: [], pages: [], summary: "PDF outputs: (empty)" }
  }

  await ensureWorker()
  const pdfjs = await import("pdfjs-dist")
  // Load once, render all pages, then destroy
  const pdf = await pdfjs.getDocument(src).promise
  const images: string[] = []
  try {
    for (const { page, dpi } of pages) {
      images.push(await renderPageWithDoc(pdf, page, dpi))
    }
  } finally {
    pdf.destroy()
  }

  const summary = `PDF outputs: ${pages.map((p) => `p${p.page}@${p.dpi}`).join(", ")}`
  return { images, pages: pages.map((p) => p.page), summary }
}

export async function buildPdfOutputsFromRules(
  src: string,
  rules: PdfOutputRule[],
  pageCount?: number,
): Promise<{ images: string[]; pages: number[]; summary: string }> {
  const pages = resolvePdfOutputPages(rules, pageCount)
  return buildPdfOutputsFromPages(src, pages)
}
