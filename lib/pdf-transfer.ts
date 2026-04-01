export interface PdfOutputRule {
  pages: string
  dpi: number
}

export interface PdfOutputPage {
  page: number
  dpi: number
}

const DEFAULT_DPI = 144

function toPositiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.round(n)
  return i > 0 ? i : null
}

export function clampDpi(v: unknown, fallback = DEFAULT_DPI): number {
  const n = toPositiveInt(v)
  if (!n) return fallback
  return Math.max(72, Math.min(600, n))
}

/** Parse printer-like page expression: "1,3,5-7" */
export function parsePageExpression(expr: string, maxPage?: number): number[] {
  if (!expr?.trim()) return []

  const out = new Set<number>()
  const tokens = expr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const token of tokens) {
    const m = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      const start = Math.min(a, b)
      const end = Math.max(a, b)
      for (let p = start; p <= end; p++) {
        if (p < 1) continue
        if (maxPage && p > maxPage) continue
        out.add(p)
      }
      continue
    }

    const single = Number(token)
    if (Number.isFinite(single) && single >= 1) {
      if (!maxPage || single <= maxPage) out.add(single)
    }
  }

  return [...out].sort((x, y) => x - y)
}

/**
 * Resolve rules to concrete page->dpi map.
 * Later rules win on conflicting page numbers.
 */
export function resolvePdfOutputPages(
  rules: PdfOutputRule[] | undefined,
  pageCount?: number,
): PdfOutputPage[] {
  const map = new Map<number, number>()
  for (const rule of rules ?? []) {
    const pages = parsePageExpression(rule.pages, pageCount)
    const dpi = clampDpi(rule.dpi)
    for (const page of pages) map.set(page, dpi)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, dpi]) => ({ page, dpi }))
}

export function resolvePdfOutputPagesWithCurrent(
  rules: PdfOutputRule[] | undefined,
  pageCount: number | undefined,
  options: {
    includeCurrentPage?: boolean
    currentPage?: number
    currentPageDpi?: number
  },
): PdfOutputPage[] {
  const base = resolvePdfOutputPages(rules, pageCount)
  const map = new Map<number, number>(base.map((p) => [p.page, p.dpi]))

  if (options.includeCurrentPage) {
    const maxPage = Math.max(pageCount ?? 1, 1)
    const current = Math.min(Math.max(Math.round(options.currentPage ?? 1), 1), maxPage)
    map.set(current, clampDpi(options.currentPageDpi))
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, dpi]) => ({ page, dpi }))
}

export function toRuleLine(rule: PdfOutputRule): string {
  return `${rule.pages}@${clampDpi(rule.dpi)}`
}

export function formatRulesAsText(rules: PdfOutputRule[]): string {
  return JSON.stringify({ outputs: rules.map((r) => ({ pages: r.pages, dpi: clampDpi(r.dpi) })) })
}

/**
 * Accepts multiple JSON shapes from AI:
 * - { outputs: [{ pages, dpi }] }
 * - { rules: [{ pages, dpi }] }
 * - [{ pages, dpi }]
 * - { pages, dpi }
 */
export function parsePdfPlanFromText(raw: string): { rules: PdfOutputRule[]; error?: string } {
  const text = raw?.trim() ?? ''
  if (!text) return { rules: [] }

  let parsed: unknown
  try {
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    parsed = JSON.parse(m ? m[0] : text)
  } catch {
    return { rules: [], error: 'Invalid JSON' }
  }

  const normalize = (item: unknown): PdfOutputRule | null => {
    if (!item || typeof item !== 'object') return null
    const obj = item as Record<string, unknown>
    const pagesRaw =
      obj.pages ??
      obj.pageRange ??
      (obj.page ? String(obj.page) : undefined)
    const dpiRaw = obj.dpi ?? obj.resolution ?? obj.ppi
    if (typeof pagesRaw !== 'string' && typeof pagesRaw !== 'number') return null
    const pages = String(pagesRaw).trim()
    if (!pages) return null
    return { pages, dpi: clampDpi(dpiRaw) }
  }

  let list: unknown[] = []
  if (Array.isArray(parsed)) {
    list = parsed
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj.outputs)) list = obj.outputs
    else if (Array.isArray(obj.rules)) list = obj.rules
    else list = [obj]
  }

  const rules = list
    .map(normalize)
    .filter((v): v is PdfOutputRule => !!v)

  return { rules }
}
