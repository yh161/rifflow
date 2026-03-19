"use client"

import React, { memo, useRef, useEffect, useCallback } from 'react'
import { NodeProps } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { AlignLeft } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { GenerateTextPanel } from '@/components/layout/node_editor/_panels'
import { registerTextarea } from './_markdown_insert'

export const meta = {
  id: 'text',
  name: 'Text',
  description: 'Documentation & notes',
  icon: AlignLeft,
  color: 'text-blue-500',
  bg: 'bg-blue-50',
  border: 'hover:border-blue-200',
  opensEditor: true,
  panelTitle: 'Generate Text',
}

export const defaultData: Partial<CustomNodeData> = {
  type: 'text',
  label: 'Text',
  content: '',
  align: 'left',
}

export const handles: HandleDef[] = [
  { id: 'in',  side: 'left'  },
  { id: 'out', side: 'right' },
]

export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const onChangeRef    = useRef(data.onDataChange)
  onChangeRef.current  = data.onDataChange

  // ── Transform-based scroll (avoids compositor-layer blur) ──────────────
  // CSS overflow-y:auto promotes the container to a compositor layer that is
  // rasterised at zoom=1. When ReactFlow's viewport scales up the layer blurs.
  // Instead we keep overflow:hidden and manually translate the inner div,
  // bypassing React's render cycle entirely (direct DOM style mutation).
  const containerRef  = useRef<HTMLDivElement>(null)
  const contentRef    = useRef<HTMLDivElement>(null)
  const trackRef      = useRef<HTMLDivElement>(null)
  const thumbRef      = useRef<HTMLDivElement>(null)
  const scrollTopRef  = useRef(0)
  const maxScrollRef  = useRef(0)
  const hideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show the track (only when there is actual overflow)
  const showTrack = useCallback(() => {
    const track = trackRef.current
    if (!track || maxScrollRef.current <= 0) return
    track.style.opacity = '1'
  }, [])

  // Hide the track after a short delay
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (trackRef.current) trackRef.current.style.opacity = '0'
    }, 1000)
  }, [])

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  // Direct DOM update for the scrollbar thumb — no React re-render.
  // Does NOT touch opacity; show/hide is managed by showTrack / scheduleHide.
  const syncThumb = useCallback(() => {
    const box   = containerRef.current
    const el    = contentRef.current
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!box || !el || !track || !thumb) return
    const cH = box.clientHeight
    const eH = el.offsetHeight
    if (eH <= cH) { track.style.display = 'none'; return }
    track.style.display = 'block'
    const tH  = Math.max(16, (cH / eH) * cH)
    const top = maxScrollRef.current > 0
      ? (scrollTopRef.current / maxScrollRef.current) * (cH - tH)
      : 0
    thumb.style.height    = `${tH}px`
    thumb.style.transform = `translateY(${top}px)`
  }, [])

  useEffect(() => {
    const el  = contentRef.current
    const box = containerRef.current
    if (!el || !box) return

    // Reset position whenever content changes
    scrollTopRef.current = 0
    el.style.transform   = 'translateY(0)'

    const update = () => {
      const max = Math.max(0, el.offsetHeight - box.clientHeight)
      maxScrollRef.current = max
      if (scrollTopRef.current > max) {
        scrollTopRef.current = max
        el.style.transform   = `translateY(-${max}px)`
      }
      syncThumb()
    }

    const ro = new ResizeObserver(update)
    ro.observe(el)
    ro.observe(box)
    update()
    return () => ro.disconnect()
  }, [data.content, syncThumb])

  // Flash the scrollbar briefly when the node becomes selected
  useEffect(() => {
    if (!selected) return
    showTrack()
    scheduleHide()
  }, [selected, showTrack, scheduleHide])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const next = Math.max(0, Math.min(maxScrollRef.current, scrollTopRef.current + e.deltaY))
    scrollTopRef.current = next
    if (contentRef.current) contentRef.current.style.transform = `translateY(-${next}px)`
    syncThumb()
    showTrack()
    scheduleHide()
  }, [syncThumb, showTrack, scheduleHide])

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (data.isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [data.isEditing])

  const handleFocus = useCallback(() => {
    registerTextarea(textareaRef.current)
  }, [])

  const handleBlur = useCallback(() => {
    registerTextarea(null)
  }, [])

  const w = data.width  ?? 180
  const h = data.height ?? 180

  return (
    <div
      className={cn(
        "rounded-xl",
        "bg-white/70 border border-slate-400/60",
        "p-3 flex flex-col overflow-hidden",
        selected && "ring-2 ring-blue-300 ring-offset-1 border-blue-200",
        data.isEditing && "ring-2 ring-blue-200 ring-offset-1 border-blue-200",
      )}
      style={{ width: w, height: h }}
    >
      <div className="flex-1 overflow-hidden text-xs text-slate-600 leading-relaxed min-h-0">
        {data.isEditing ? (
          <textarea
            ref={textareaRef}
            className={cn(
              "nodrag nopan nowheel",
              "w-full h-full resize-none outline-none bg-transparent",
              "text-xs text-slate-700 leading-relaxed font-mono",
              "placeholder:text-slate-300",
            )}
            placeholder="Write markdown here…"
            defaultValue={data.content ?? ''}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onInput={(e) => {
              onChangeRef.current?.({ content: (e.currentTarget as HTMLTextAreaElement).value })
            }}
          />
        ) : data.content ? (
          // overflow:hidden — never creates a compositor scroll layer.
          // Scrolling is handled via transform on the inner div (handleWheel).
          <div
            ref={containerRef}
            className={cn("h-full overflow-hidden relative", selected && "nowheel")}
            onWheel={selected ? handleWheel : undefined}
          >
            {/* Thin scrollbar — driven by syncThumb, not CSS overflow */}
            <div
              ref={trackRef}
              style={{
                display: 'none', opacity: 0,
                transition: 'opacity 200ms ease',
                position: 'absolute',
                right: 2, top: 3, bottom: 3, width: 3,
                pointerEvents: 'none', zIndex: 10,
              }}
            >
              <div
                ref={thumbRef}
                style={{
                  position: 'absolute', top: 0,
                  width: '100%', minHeight: 16,
                  borderRadius: 99,
                  background: 'rgba(148,163,184,0.45)',
                }}
              />
            </div>
            <div
              ref={contentRef}
              className={cn(
                "text-xs text-slate-600 leading-relaxed",
                "[&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-1 [&_h1]:text-slate-800",
                "[&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-0.5 [&_h2]:mb-0.5 [&_h2]:text-slate-800",
                "[&_h3]:text-xs [&_h3]:font-medium [&_h3]:mt-0.5 [&_h3]:mb-0 [&_h3]:text-slate-700",
                "[&_p]:my-0.5 [&_p]:leading-relaxed",
                "[&_ul]:my-0.5 [&_ul]:pl-4 [&_ul]:list-disc [&_li]:my-0",
                "[&_ol]:my-0.5 [&_ol]:pl-4 [&_ol]:list-decimal",
                "[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_blockquote]:text-slate-500 [&_blockquote]:my-0.5 [&_blockquote]:italic",
                "[&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px] [&_code]:font-mono [&_code]:text-slate-600",
                "[&_pre]:bg-slate-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-0.5 [&_pre_code]:bg-transparent [&_pre_code]:px-0",
                "[&_strong]:font-semibold [&_em]:italic",
                "[&_a]:text-blue-500 [&_a]:underline",
                "[&_hr]:border-slate-200 [&_hr]:my-1",
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.content}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <span className="italic text-slate-300 text-[11px]">
            Double-click to edit…
          </span>
        )}
      </div>
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'TextNode'

export function ModalContent({ data, nodeId, onUpdate, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <GenerateTextPanel
      data={data as CustomNodeData}
      nodeId={nodeId}
      onDataChange={onUpdate as (u: Partial<CustomNodeData>) => void}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
    />
  )
}
