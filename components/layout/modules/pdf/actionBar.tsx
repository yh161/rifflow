"use client"

import React, { useEffect, useRef, useState } from "react"
import { Upload, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { ActionButton } from "../../node_editor/_action_bar"
import type { ActionBarProps } from "../_action_bar_types"
import { clampDpi, resolvePdfOutputPagesWithCurrent } from "@/lib/pdf-transfer"

export function ActionBarContent({ data, onUpload, onDownload, onPdfPrevPage, onPdfNextPage, onPdfSetPage, onPdfSetPreviewDpi }: ActionBarProps) {
  const totalPages = Math.max(data.pdfPageCount ?? 1, 1)
  const currentPage = Math.max(data.pdfCurrentPage ?? 1, 1)
  const includeCurrentPage = Boolean(data.pdfIncludeCurrentPage)
  const currentPageDpi = Math.max(72, Math.min(600, Math.round(data.pdfIncludeCurrentPageDpi ?? 220)))
  const previewDpi = clampDpi(data.pdfPreviewDpi ?? 220)
  const previewPresets = [144, 220, 300] as const
  const currentPresetIdx = previewPresets.indexOf(previewDpi as (typeof previewPresets)[number])
  const normalizedPresetIdx = currentPresetIdx >= 0
    ? currentPresetIdx
    : previewDpi <= 182
      ? 0
      : previewDpi >= 260
        ? 2
        : 1
  const nextPreviewDpi = previewPresets[(normalizedPresetIdx + 1) % previewPresets.length]
  const previewLabel = previewDpi <= 160 ? 'Clarity Low' : previewDpi >= 260 ? 'Clarity Ultra' : 'Clarity High'
  const [pageInput, setPageInput] = useState(String(currentPage))
  const [isPageInputEditing, setIsPageInputEditing] = useState(false)
  const pageInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  useEffect(() => {
    if (isPageInputEditing) {
      pageInputRef.current?.focus()
      pageInputRef.current?.select()
    }
  }, [isPageInputEditing])

  const commitPageInput = () => {
    const parsed = Number(pageInput)
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage))
      setIsPageInputEditing(false)
      return
    }
    const safe = Math.min(Math.max(Math.round(parsed), 1), totalPages)
    onPdfSetPage?.(safe)
    setPageInput(String(safe))
    setIsPageInputEditing(false)
  }

  const resolvedPages = resolvePdfOutputPagesWithCurrent(data.pdfOutputRules, data.pdfPageCount, {
    includeCurrentPage,
    currentPage,
    currentPageDpi,
  })
  const resolvedPageNums = resolvedPages.map((p) => p.page)
  const outputCount = resolvedPageNums.length
  const outputUnit = outputCount === 1 ? 'page' : 'pages'
  const outputLabel = outputCount > 0
    ? `Output ${outputUnit} p${resolvedPageNums.slice(0, 4).join(',')}${outputCount > 4 ? `+${outputCount - 4}` : ''}`
    : 'Output -'
  return (
    <>
      <ActionButton icon={Upload}   label="Upload"   onClick={onUpload} />
      <ActionButton icon={Download} label="Download" onClick={onDownload} />
      <button
        onClick={onPdfPrevPage}
        disabled={currentPage <= 1}
        title="Prev page"
        className="h-7 w-7 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none transition-colors"
      >
        <ChevronLeft size={13} strokeWidth={2} />
      </button>
      <div className="flex items-center px-0.5">
        {isPageInputEditing ? (
          <input
            ref={pageInputRef}
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={commitPageInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitPageInput()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setPageInput(String(currentPage))
                setIsPageInputEditing(false)
              }
            }}
            className="w-11 h-6 rounded border border-rose-300 bg-white text-[11px] text-slate-500 text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            title="Jump to page"
          />
        ) : (
          <button
            onClick={() => setIsPageInputEditing(true)}
            className="h-6 min-w-[2ch] px-0.5 rounded text-[11px] text-slate-500 tabular-nums hover:bg-slate-100 transition-colors"
            title="Jump to page"
          >
            {currentPage}
          </button>
        )}
        <span className="mx-1 text-[11px] text-slate-400 tabular-nums select-none">/</span>
        <span className="text-[11px] text-slate-400 tabular-nums select-none">{totalPages}</span>
      </div>
      <button
        onClick={onPdfNextPage}
        disabled={currentPage >= totalPages}
        title="Next page"
        className="h-7 w-7 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none transition-colors"
      >
        <ChevronRight size={13} strokeWidth={2} />
      </button>
      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
      <button
        onClick={() => onPdfSetPreviewDpi?.(nextPreviewDpi)}
        className="h-7 px-2 rounded-full text-[10px] text-slate-500 hover:bg-slate-100 transition-colors"
        title={`Preview DPI ${previewDpi} (click to switch to ${nextPreviewDpi})`}
      >
        {previewLabel} · {previewDpi}
      </button>
      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
      <span className="text-[10px] text-rose-500 px-1 select-none" title={outputCount > 0 ? `Output ${outputUnit}: ${resolvedPageNums.join(', ')}` : 'No output pages'}>
        {outputLabel}
      </span>
    </>
  )
}
