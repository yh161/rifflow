"use client"

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Plus, Trash2, Zap, Square, Lock, ChevronUp, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { useReactFlow, NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import type { CustomNodeData, ModuleModalProps } from '../_types'
import type { HandleDef } from '../_handle'
import { RefPromptEditor, type RefPromptEditorHandle } from '@/components/layout/node_editor/_panels'
import { UpstreamReference } from '@/components/layout/node_editor/_upstream_reference'
import { TEXT_MODELS } from '@/lib/models'
import { creditLabel } from '@/lib/credits'
import { clampDpi, formatRulesAsText, resolvePdfOutputPagesWithCurrent, type PdfOutputRule } from '@/lib/pdf-transfer'
import { buildPdfOutputsFromPages, revokeBlobUrls } from './render'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

function defaultParamsForModel(modelId: string): Record<string, string> {
  const def = TEXT_MODELS.find((m) => m.id === modelId)
  return Object.fromEntries((def?.params ?? []).map((p) => [p.key, p.default]))
}

// ─── pdfjs worker setup (once) ───────────────────────────────────────────────

let workerReady: Promise<void> | null = null
function ensureWorker(): Promise<void> {
  if (!workerReady) {
    workerReady = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
    })
  }
  return workerReady
}

// ─── Off-screen render using an already-loaded PDFDocumentProxy ───────────────

async function renderPageWithDoc(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
): Promise<{ blob: string; pw: number; ph: number; totalPages: number }> {
  const totalPages = pdf.numPages
  const safePage = Math.min(Math.max(pageNumber, 1), totalPages)
  const page = await pdf.getPage(safePage)
  const base = page.getViewport({ scale: 1 })
  const scale = clampDpi(dpi) / 72
  const vp = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  const ctx = canvas.getContext('2d')!
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
  const blob = await new Promise<string>((res, rej) =>
    canvas.toBlob(
      (b) => b ? res(URL.createObjectURL(b)) : rej(new Error('toBlob failed')),
      'image/jpeg', 0.92,
    ),
  )
  return { blob, pw: Math.round(base.width), ph: Math.round(base.height), totalPages }
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export const meta = {
  id: 'pdf',
  name: 'PDF',
  description: 'Document pages on canvas',
  icon: FileText,
  color: 'text-rose-500',
  bg: 'bg-rose-50',
  border: 'hover:border-rose-200',
  opensEditor: true,
  panelTitle: 'PDF Document',
  category: 'Assets',
  doneColor: 'rgba(244, 63, 94, 0.55)',
}

export const defaultData: Partial<CustomNodeData> = {
  type: 'pdf',
  label: 'PDF',
  width: 220,
  height: 300,
  pdfCurrentPage: 1,
  pdfPreviewDpi: 220,
  pdfIncludeCurrentPage: false,
  pdfIncludeCurrentPageDpi: 220,
  // Default to no downstream outputs until user explicitly configures pages.
  pdfOutputRules: [],
}

export const handles: HandleDef[] = [
  { id: 'in',  side: 'left'  },
  { id: 'out', side: 'right' },
]

// ─── NodeUI ───────────────────────────────────────────────────────────────────

export const NodeUI = ({
  data,
  selected,
  nodeId,
}: {
  data: CustomNodeData
  selected?: boolean
  nodeId?: string
}) => {
  const { setNodes } = useReactFlow()

  const displayW = data.width  ?? 220
  const displayH = data.height ?? 300
  const isSelected = !!selected
  const isEditing = !!data.isEditing
  const previewDpi = clampDpi(data.pdfPreviewDpi ?? 220)
  const pageCount = data.pdfPageCount ?? 0
  const page = Math.min(Math.max(data.pdfCurrentPage ?? 1, 1), Math.max(pageCount, 1))

  // ── display image (blob URL) ──────────────────────────────────────────────
  const [imgSrc,    setImgSrc]    = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const imgSrcRef   = useRef<string | null>(null)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sizedRef    = useRef(false)  // has auto-sized for this src?
  const pdfDocRef   = useRef<PDFDocumentProxy | null>(null)
  const pdfDocSrcRef = useRef<string | null>(null)

  const doRender = useCallback(() => {
    if (!data.pdfSrc) return
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      setRendering(true)
      try {
        // Load or reuse cached document (avoids re-fetching on page/DPI change)
        if (pdfDocSrcRef.current !== data.pdfSrc) {
          if (pdfDocRef.current) { pdfDocRef.current.destroy(); pdfDocRef.current = null }
          await ensureWorker()
          const pdfjs = await import('pdfjs-dist')
          pdfDocRef.current = await pdfjs.getDocument(data.pdfSrc).promise
          pdfDocSrcRef.current = data.pdfSrc!
        }
        const { blob, pw, ph, totalPages } = await renderPageWithDoc(pdfDocRef.current!, page, previewDpi)

        // Revoke previous blob
        if (imgSrcRef.current) URL.revokeObjectURL(imgSrcRef.current)
        imgSrcRef.current = blob
        setImgSrc(blob)
        setLoadError(null)

        // Update node: page count + optional auto-size on first load
        if (nodeId) {
          setNodes((ns) => ns.map((n) => {
            if (n.id !== nodeId) return n
            const hadSize = !!((n.style?.width as number | undefined) || n.data.width)
            const alreadySized = sizedRef.current || hadSize
            sizedRef.current = true

            const oldW = (n.style?.width  as number | undefined) ?? n.data.width  ?? 220
            const oldH = (n.style?.height as number | undefined) ?? n.data.height ?? 300
            const BASE_H = 300
            const newW = alreadySized ? oldW : Math.max(160, Math.round((BASE_H * pw) / ph))
            const newH = alreadySized ? oldH : BASE_H

            return {
              ...n,
              style:    { ...n.style, width: newW, height: newH },
              data:     { ...n.data, naturalWidth: pw, naturalHeight: ph,
                          width: newW, height: newH, pdfPageCount: totalPages },
              position: alreadySized
                ? n.position
                : { x: n.position.x + (oldW - newW) / 2, y: n.position.y + (oldH - newH) },
            }
          }))
        }
      } catch (e) {
        setLoadError(String(e))
      } finally {
        setRendering(false)
      }
    }, 150)
  }, [data.pdfSrc, page, previewDpi, nodeId, setNodes])

  // Render only when src/page/preview dpi changes
  useEffect(() => {
    if (!data.pdfSrc) { setImgSrc(null); return }
    if (data.pdfSrc !== imgSrcRef.current?.slice(0, 4)) sizedRef.current = false  // reset on new src
    doRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.pdfSrc, page, previewDpi])

  // Revoke blob + destroy cached doc on unmount
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (imgSrcRef.current) URL.revokeObjectURL(imgSrcRef.current)
    if (pdfDocRef.current) { pdfDocRef.current.destroy(); pdfDocRef.current = null }
  }, [])

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: displayW, height: displayH, position: 'relative' }}>
      <div
        className={cn(
          'overflow-hidden bg-white/70 border h-full w-full',
          'transition-[box-shadow,border-color,border-radius] duration-200',
        )}
        style={{
          borderRadius: data.isEditing ? '0px' : '12px',
          borderColor: isSelected || isEditing
            ? 'rgba(244,63,94,0.62)'
            : data.mode === 'done'
              ? 'rgba(244,63,94,0.52)'
              : 'rgba(100,116,139,0.36)',
          boxShadow: isSelected
            ? '0 6px 16px rgba(15,23,42,0.10), 0 0 0 1px rgba(244,63,94,0.20), 0 0 10px rgba(251,113,133,0.14)'
            : 'none',
          transition: 'box-shadow 180ms ease, border-color 180ms ease, border-radius 240ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={`PDF page ${page}`}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : data.pdfSrc ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[11px] text-slate-400">
              {rendering ? 'Rendering…' : 'Loading PDF…'}
            </span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <FileText size={24} className="text-slate-200" />
            <span className="text-[10px] text-slate-300">Upload a PDF</span>
          </div>
        )}
      </div>

      {loadError && (
        <div className="absolute inset-x-2 bottom-2 text-[10px] text-rose-500 bg-white/90 border border-rose-200 rounded px-2 py-1 truncate">
          {loadError}
        </div>
      )}

      {(() => {
        const outPages = resolvePdfOutputPagesWithCurrent(data.pdfOutputRules, data.pdfPageCount, {
          includeCurrentPage: Boolean(data.pdfIncludeCurrentPage),
          currentPage: data.pdfCurrentPage,
          currentPageDpi: data.pdfIncludeCurrentPageDpi,
        }).map((p) => p.page)
        const isOutputPage = outPages.includes(page)
        if (!isOutputPage) return null
        return (
        <div className="absolute right-2 top-2 text-[8px] text-rose-500 bg-white/90 border border-rose-200 rounded px-1.5 py-0.5">
          OUTPUT
        </div>
        )
      })()}
    </div>
  )
}

export const ReactFlowNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} nodeId={id} />
))
ReactFlowNode.displayName = 'PdfNode'

function PdfRulesEditor({
  rules,
  onChange,
  disabled,
}: {
  rules: PdfOutputRule[]
  onChange: (next: PdfOutputRule[]) => void
  disabled?: boolean
}) {
  const DPI_PRESETS = [
    { label: 'Normal', value: 144 },
    { label: 'High', value: 220 },
    { label: 'Ultra', value: 300 },
  ]

  const displayRules = rules.length > 0 ? rules : [{ pages: '', dpi: 144 }]

  const setRule = (idx: number, patch: Partial<PdfOutputRule>) => {
    const next = displayRules.map((r, i) => i === idx ? { ...r, ...patch } : r)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {displayRules.map((rule, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <div className="flex-1 space-y-1">
            <p className="text-[10px] text-slate-400">Pages</p>
            <input
              value={rule.pages}
              disabled={disabled}
              onChange={(e) => setRule(idx, { pages: e.target.value })}
              placeholder="1,3,5-7"
              className="w-full h-8 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-rose-300"
            />
          </div>

          <div className="w-[190px] space-y-1">
            <p className="text-[10px] text-slate-400">DPI</p>
            <div className="flex items-center gap-1">
              <button
                disabled={disabled}
                onClick={() => setRule(idx, { dpi: clampDpi((rule.dpi ?? 144) - 10) })}
                className="h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                title="DPI -10"
              >
                -
              </button>
              <input
                type="number"
                min={72}
                max={600}
                step={10}
                disabled={disabled}
                value={rule.dpi}
                onChange={(e) => setRule(idx, { dpi: clampDpi(Number(e.target.value || 144)) })}
                className="flex-1 h-8 rounded-md border border-slate-200 px-2 text-xs text-center outline-none focus:border-rose-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                disabled={disabled}
                onClick={() => setRule(idx, { dpi: clampDpi((rule.dpi ?? 144) + 10) })}
                className="h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                title="DPI +10"
              >
                +
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {DPI_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  disabled={disabled}
                  onClick={() => setRule(idx, { dpi: preset.value })}
                  className={cn(
                    'h-7 rounded-md text-[10px] border transition-colors',
                    rule.dpi === preset.value
                      ? 'border-rose-300 bg-rose-50 text-rose-600'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                    disabled && 'opacity-30',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <button
            disabled={disabled}
            onClick={() => onChange(displayRules.filter((_, i) => i !== idx))}
            className="mt-6 p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30"
            title="Delete rule"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          disabled={disabled}
          onClick={() => onChange([...rules, { pages: '', dpi: 144 }])}
          className="inline-flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-600 disabled:opacity-30"
        >
          <Plus size={11} /> Add range
        </button>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        DPI suggestion: simple text 144; mixed content 220; complex charts 300.
      </p>
    </div>
  )
}

function PdfModelDropdown({
  value,
  onChange,
  locked,
}: {
  value: string
  onChange: (id: string) => void
  locked?: boolean
}) {
  const name = TEXT_MODELS.find((m) => m.id === value)?.name ?? value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={locked}>
        <button
          disabled={locked}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full text-xs text-slate-600 font-medium transition-all border border-transparent",
            locked
              ? "opacity-30 cursor-not-allowed"
              : "hover:bg-slate-100/80 hover:border-slate-200/80",
          )}
        >
          {name}
          <ChevronUp size={10} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
          Model
        </div>
        {TEXT_MODELS.map((m) => (
          <DropdownMenuItem
            key={m.id}
            className={cn("text-xs", value === m.id && "font-semibold text-slate-800")}
            onClick={() => onChange(m.id)}
          >
            {m.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PdfModelParamsPopover({
  model,
  selected,
  onChange,
  locked,
}: {
  model: string
  selected: Record<string, string>
  onChange: (id: string, val: string) => void
  locked?: boolean
}) {
  const params = TEXT_MODELS.find((m) => m.id === model)?.params ?? []
  if (params.length === 0) return null

  const summary = params.map((p) => selected[p.key] ?? p.default).join(' · ')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          disabled={locked}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs text-slate-600 font-medium transition-all border border-transparent',
            locked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100/80 hover:border-slate-200/80',
          )}
        >
          <SlidersHorizontal size={10} className="text-slate-400" />
          <span>{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-60 p-3">
        <div className="space-y-3">
          {params.map((param) => (
            <div key={param.key}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {param.label}
              </p>
              <div className={cn(
                'bg-slate-100 rounded-lg p-0.5 gap-0.5',
                param.options.length <= 4 ? 'flex' : 'grid grid-cols-4',
              )}>
                {param.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => onChange(param.key, opt)}
                    className={cn(
                      'py-1 text-xs font-medium rounded-md transition-all',
                      param.options.length <= 4 ? 'flex-1' : '',
                      (selected[param.key] ?? param.default) === opt
                        ? 'bg-white shadow-sm text-slate-800'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ModalContent({
  data,
  nodeId,
  onUpdate,
  mode = 'auto',
  isGenerating = false,
  onGenerate,
  onStop,
}: ModuleModalProps) {
  const { getNodes, getEdges } = useReactFlow()
  const d = data as CustomNodeData
  const persist = onUpdate as (updates: Partial<CustomNodeData>) => void
  const editorRef = useRef<RefPromptEditorHandle>(null)

  const [prompt, setPrompt] = useState(d.prompt ?? '')
  const [model, setModel] = useState(d.model ?? TEXT_MODELS[0].id)
  const [params, setParams] = useState<Record<string, string>>(
    d.params ?? defaultParamsForModel(d.model ?? TEXT_MODELS[0].id)
  )
  const [rules, setRules] = useState<PdfOutputRule[]>(d.pdfOutputRules ?? [])
  const [includeCurrentPage, setIncludeCurrentPage] = useState(Boolean(d.pdfIncludeCurrentPage))
  const [currentPageDpi, setCurrentPageDpi] = useState(clampDpi(d.pdfIncludeCurrentPageDpi ?? (d.pdfOutputRules?.[0]?.dpi ?? 220)))
  const [isApplyingManual, setIsApplyingManual] = useState(false)
  const applySeqRef = useRef(0)

  useEffect(() => {
    setPrompt(d.prompt ?? '')
  }, [d.prompt])

  useEffect(() => {
    setModel(d.model ?? TEXT_MODELS[0].id)
  }, [d.model])

  useEffect(() => {
    setParams(d.params ?? defaultParamsForModel(d.model ?? model))
  }, [d.params, d.model, model])

  useEffect(() => {
    setRules(d.pdfOutputRules ?? [])
  }, [d.pdfOutputRules])

  useEffect(() => {
    setIncludeCurrentPage(Boolean(d.pdfIncludeCurrentPage))
  }, [d.pdfIncludeCurrentPage])

  useEffect(() => {
    setCurrentPageDpi(clampDpi(d.pdfIncludeCurrentPageDpi ?? (d.pdfOutputRules?.[0]?.dpi ?? 220)))
  }, [d.pdfIncludeCurrentPageDpi, d.pdfOutputRules])

  const resolvedPages = useMemo(() => {
    return resolvePdfOutputPagesWithCurrent(rules, d.pdfPageCount, {
      includeCurrentPage,
      currentPage: d.pdfCurrentPage,
      currentPageDpi,
    })
  }, [rules, d.pdfPageCount, d.pdfCurrentPage, includeCurrentPage, currentPageDpi])

  const outputPreview = useMemo(() => {
    if (resolvedPages.length === 0) return 'Output: -'
    const head = resolvedPages.slice(0, 4).map((p) => `p${p.page}@${p.dpi}`).join(', ')
    return `Output: ${head}${resolvedPages.length > 4 ? ` +${resolvedPages.length - 4}` : ''}`
  }, [resolvedPages])

  const isAuto = mode === 'auto'
  const isNote = mode === 'done'

  const setPromptValue = (v: string) => {
    setPrompt(v)
    persist({ prompt: v })
  }

  const setModelValue = (v: string) => {
    setModel(v)
    const nextParams = defaultParamsForModel(v)
    setParams(nextParams)
    persist({ model: v, params: nextParams })
  }

  const setParamValue = (id: string, val: string) => {
    const next = { ...params, [id]: val }
    setParams(next)
    persist({ params: next })
  }

  const setRulesValue = (next: PdfOutputRule[]) => {
    const normalized = next.map((r) => ({ pages: r.pages, dpi: clampDpi(r.dpi) }))
    setRules(normalized)
    persist({ pdfOutputRules: normalized, pdfPlanRaw: formatRulesAsText(normalized) })
  }

  const setIncludeCurrentPageValue = (enabled: boolean) => {
    setIncludeCurrentPage(enabled)
    persist({ pdfIncludeCurrentPage: enabled })
    if (d.pdfSrc && !isGenerating && !isNote) {
      void applyManualRules({ includeCurrentPage: enabled })
    }
  }

  const setCurrentPageDpiValue = (nextDpi: number) => {
    const safe = clampDpi(nextDpi)
    setCurrentPageDpi(safe)
    persist({ pdfIncludeCurrentPageDpi: safe })
  }

  const applyManualRules = useCallback(async (overrides?: {
    rules?: PdfOutputRule[]
    includeCurrentPage?: boolean
    currentPageDpi?: number
  }) => {
    if (!d.pdfSrc) return
    const activeRules = overrides?.rules ?? rules
    const activeIncludeCurrentPage = overrides?.includeCurrentPage ?? includeCurrentPage
    const activeCurrentPageDpi = overrides?.currentPageDpi ?? currentPageDpi

    const runId = ++applySeqRef.current
    setIsApplyingManual(true)
    try {
      const resolved = resolvePdfOutputPagesWithCurrent(activeRules, d.pdfPageCount, {
        includeCurrentPage: activeIncludeCurrentPage,
        currentPage: d.pdfCurrentPage,
        currentPageDpi: activeCurrentPageDpi,
      })
      const oldUrls = d.pdfOutputImages ?? []
      if (resolved.length === 0) {
        revokeBlobUrls(oldUrls)
        if (runId !== applySeqRef.current) return
        persist({
          pdfOutputRules: activeRules,
          pdfIncludeCurrentPage: activeIncludeCurrentPage,
          pdfIncludeCurrentPageDpi: activeCurrentPageDpi,
          pdfOutputImages: [],
          pdfOutputPageNums: [],
          content: 'PDF outputs: (empty)',
          pdfPlanRaw: formatRulesAsText(activeRules),
          pdfPlanError: undefined,
        })
        return
      }

      const { images, pages, summary } = await buildPdfOutputsFromPages(d.pdfSrc, resolved)
      if (runId !== applySeqRef.current) {
        revokeBlobUrls(images)
        return
      }
      revokeBlobUrls(oldUrls)
      persist({
        pdfOutputRules: activeRules,
        pdfIncludeCurrentPage: activeIncludeCurrentPage,
        pdfIncludeCurrentPageDpi: activeCurrentPageDpi,
        pdfOutputImages: images,
        pdfOutputPageNums: pages,
        content: summary,
        pdfPlanRaw: formatRulesAsText(activeRules),
        pdfPlanError: undefined,
      })
    } catch (err) {
      persist({ pdfPlanError: err instanceof Error ? err.message : 'Failed to render manual outputs' })
    } finally {
      if (runId === applySeqRef.current) {
        setIsApplyingManual(false)
      }
    }
  }, [d.pdfSrc, d.pdfPageCount, d.pdfCurrentPage, d.pdfOutputImages, persist, rules, includeCurrentPage, currentPageDpi])

  const handleInsertReference = useCallback((ref: string) => {
    const id = ref.replace(/^\{\{/, '').replace(/\}\}$/, '')
    editorRef.current?.insertReference(id)
  }, [])

  const hasUpstreamImage = nodeId ? (() => {
    const edges = getEdges().filter((e) => e.target === nodeId)
    const nodes = getNodes()
    return edges.some((e) => {
      const src = nodes.find((n) => n.id === e.source)
      return src?.data?.type === 'image'
    })
  })() : false
  const textModelDef = TEXT_MODELS.find((m) => m.id === model)
  const showImageInputWarning = hasUpstreamImage && !textModelDef?.supportsImageInput

  return (
    <div className="flex flex-col">
      <div className="px-3 pt-2 pb-2 border-b border-slate-100">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Page outputs</p>
          <button
            type="button"
            disabled={isGenerating || isNote}
            onClick={() => setIncludeCurrentPageValue(!includeCurrentPage)}
            className={cn(
              'h-6 px-1 text-[10px] transition-all inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700',
              (isGenerating || isNote) && 'opacity-30 cursor-not-allowed',
            )}
            title="Also include current page in outputs"
          >
            <span className={cn(
              'relative inline-flex h-3.5 w-6 rounded-full transition-colors',
              includeCurrentPage ? 'bg-rose-400' : 'bg-slate-300',
            )}>
              <span className={cn(
                'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform',
                includeCurrentPage ? 'translate-x-3' : 'translate-x-0.5',
              )} />
            </span>
            Current page
          </button>
        </div>

        <div className={cn(
          'overflow-hidden transition-all duration-200 ease-out',
          includeCurrentPage ? 'max-h-28 opacity-100 translate-y-0 mb-2' : 'max-h-0 opacity-0 -translate-y-1 mb-0',
        )}>
          <div className="flex items-start gap-2 rounded-md border border-rose-100 bg-rose-50/40 px-2 py-2">
            <div className="flex-1 space-y-1">
              <p className="text-[10px] text-slate-400">Pages</p>
              <div className="w-full h-8 rounded-md border border-rose-200 bg-white px-2 text-xs flex items-center text-rose-600">
                current p{Math.max(1, Math.min(d.pdfCurrentPage ?? 1, Math.max(d.pdfPageCount ?? 1, 1)))}
              </div>
            </div>

            <div className="w-[190px] space-y-1">
              <p className="text-[10px] text-slate-400">DPI</p>
              <div className="flex items-center gap-1">
                <button
                  disabled={isGenerating || isNote}
                  onClick={() => setCurrentPageDpiValue(currentPageDpi - 10)}
                  className="h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  title="DPI -10"
                >
                  -
                </button>
                <input
                  type="number"
                  min={72}
                  max={600}
                  step={10}
                  disabled={isGenerating || isNote}
                  value={currentPageDpi}
                  onChange={(e) => setCurrentPageDpiValue(Number(e.target.value || 144))}
                  className="flex-1 h-8 rounded-md border border-slate-200 px-2 text-xs text-center outline-none focus:border-rose-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  disabled={isGenerating || isNote}
                  onClick={() => setCurrentPageDpiValue(currentPageDpi + 10)}
                  className="h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                  title="DPI +10"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <PdfRulesEditor
          rules={rules}
          onChange={setRulesValue}
          disabled={isGenerating || isNote}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400" title={outputPreview}>
            {outputPreview}
          </span>
          <button
            disabled={!d.pdfSrc || isGenerating || isApplyingManual || isNote}
            onClick={() => void applyManualRules()}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs border transition-all",
              (!d.pdfSrc || isGenerating || isApplyingManual || isNote)
                ? "text-slate-300 border-slate-200"
                : "text-rose-600 border-rose-300 bg-rose-50 hover:bg-rose-100",
            )}
          >
            {isApplyingManual ? 'Rendering…' : 'Apply page outputs'}
          </button>
        </div>
      </div>

      {nodeId && <UpstreamReference nodeId={nodeId} onInsertReference={handleInsertReference} />}

      <RefPromptEditor
        ref={editorRef}
        value={prompt}
        onChange={(v) => !isGenerating && setPromptValue(v)}
        placeholder={
          isNote
            ? 'Write a note about this PDF…'
            : isAuto
              ? 'Describe how the workflow should pick PDF pages + DPI as JSON…'
              : 'Optional: ask AI to generate output rules JSON, then click Generate…'
        }
        readOnly={isGenerating}
        minHeight={90}
      />
      {showImageInputWarning && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border-t border-amber-100 text-amber-700 text-[11px]">
          <AlertTriangle size={11} className="flex-shrink-0" />
          <span>{textModelDef?.name ?? model} does not support image input. Switch to Gemini, Claude, or GPT to use image references.</span>
        </div>
      )}

      <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        <PdfModelDropdown
          value={model}
          onChange={setModelValue}
          locked={isGenerating || isNote}
        />
        <PdfModelParamsPopover
          model={model}
          selected={params}
          onChange={setParamValue}
          locked={isGenerating || isNote}
        />

        {d.pdfPlanError && <span className="text-[11px] text-rose-500">{d.pdfPlanError}</span>}

        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-300/80"
          >
            <Square size={10} className="fill-rose-600" /> Stop
          </button>
        ) : isAuto || isNote ? (
          <>
            <span className="ml-auto text-xs text-slate-500">{creditLabel(model, params)}</span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-slate-300 border border-slate-100 select-none">
              <Lock size={10} /> {isNote ? 'Note mode' : 'Runs in workflow'}
            </div>
          </>
        ) : (
          <>
            <span className="ml-auto text-xs text-slate-500">{creditLabel(model, params)}</span>
            <button
              disabled={!prompt.trim()}
              onClick={() => onGenerate?.(prompt, model, params)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all",
                prompt.trim()
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80"
                  : "text-slate-300 cursor-not-allowed border border-slate-200/60",
              )}
            >
              <Zap size={11} /> Generate
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export { resultHandler } from './resultHandler'
export { ActionBarContent } from './actionBar'
