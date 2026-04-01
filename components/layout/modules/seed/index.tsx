"use client"

import React, { memo, useRef, useEffect, useCallback } from 'react'
import { NodeProps } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CustomNodeData } from '../_types'
import type { HandleDef } from '../_handle'
import { registerTextarea } from '../_markdown_insert'

export const meta = {
  id:          'seed',
  name:        'Seed',
  description: 'Dynamic seed content — generated fresh each template iteration',
  icon:        Sparkles,
  color:       'text-violet-500',
  bg:          'bg-violet-50',
  border:      'hover:border-violet-200',
  opensEditor: true,
}

export const defaultData: Partial<CustomNodeData> = {
  type:     'seed',
  label:    'Seed',
  content:  '',
  isSeed:   true,
  isLocked: true,
  width:    180,
  height:   180,
}

// Seed only outputs — it lives inside a loop and feeds sibling nodes.
export const handles: HandleDef[] = [
  { id: 'out', side: 'right' },
]

// ─────────────────────────────────────────────
// NodeUI
// ─────────────────────────────────────────────
export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const onChangeRef   = useRef(data.onDataChange)
  onChangeRef.current = data.onDataChange

  // ── Transform-based scroll (avoids compositor-layer blur) ──────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef   = useRef<HTMLDivElement>(null)
  const trackRef     = useRef<HTMLDivElement>(null)
  const thumbRef     = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const maxScrollRef = useRef(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTrack = useCallback(() => {
    const track = trackRef.current
    if (!track || maxScrollRef.current <= 0) return
    track.style.opacity = '1'
  }, [])

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (trackRef.current) trackRef.current.style.opacity = '0'
    }, 1000)
  }, [])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

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

  const handleFocus = useCallback(() => { registerTextarea(textareaRef.current) }, [])
  const handleBlur  = useCallback(() => { registerTextarea(null) }, [])

  const w = data.width  ?? 180
  const h = data.height ?? 180

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden transition-[box-shadow,border-color] duration-150',
        'bg-violet-50/80 border border-violet-200/60',
        selected       && 'border-violet-400/70 bg-violet-50/90',
        data.isEditing && '!border-violet-500 !rounded-none',
      )}
      style={{ width: w, height: h, borderRadius: data.isEditing ? 0 : 12 }}
    >
      {/* Content */}
      <div className="flex-1 px-2.5 py-2 min-h-0 overflow-hidden">
        {data.isEditing ? (
          <textarea
            ref={textareaRef}
            className={cn(
              "nodrag nopan nowheel",
              "w-full h-full resize-none outline-none bg-transparent",
              "text-[11px] text-violet-700 leading-relaxed font-mono",
              "placeholder:text-violet-300/60",
            )}
            placeholder="Describe what varies each iteration…"
            defaultValue={data.content ?? ''}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onInput={(e) => {
              onChangeRef.current?.({ content: (e.currentTarget as HTMLTextAreaElement).value })
            }}
          />
        ) : data.content ? (
          <div
            ref={containerRef}
            className={cn("h-full overflow-hidden relative", selected && "nowheel")}
            onWheel={selected ? handleWheel : undefined}
          >
            {/* Thin scrollbar */}
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
                  background: 'rgba(167,139,250,0.45)',
                }}
              />
            </div>
            <div
              ref={contentRef}
              className={cn(
                "text-[11px] text-violet-700/80 leading-relaxed",
                "[&_h1]:text-xs [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-1 [&_h1]:text-violet-800",
                "[&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:mt-0.5 [&_h2]:mb-0.5 [&_h2]:text-violet-800",
                "[&_h3]:text-[11px] [&_h3]:font-medium [&_h3]:mt-0.5 [&_h3]:mb-0 [&_h3]:text-violet-700",
                "[&_p]:my-0.5 [&_p]:leading-relaxed",
                "[&_ul]:my-0.5 [&_ul]:pl-4 [&_ul]:list-disc [&_li]:my-0",
                "[&_ol]:my-0.5 [&_ol]:pl-4 [&_ol]:list-decimal",
                "[&_blockquote]:border-l-2 [&_blockquote]:border-violet-300 [&_blockquote]:pl-2 [&_blockquote]:text-violet-500 [&_blockquote]:my-0.5 [&_blockquote]:italic",
                "[&_code]:bg-violet-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px] [&_code]:font-mono [&_code]:text-violet-600",
                "[&_pre]:bg-violet-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-0.5 [&_pre_code]:bg-transparent [&_pre_code]:px-0",
                "[&_strong]:font-semibold [&_em]:italic",
                "[&_a]:text-violet-500 [&_a]:underline",
                "[&_hr]:border-violet-200 [&_hr]:my-1",
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.content}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <span className="italic text-violet-300/60 text-[11px]">
            Describe what varies each iteration…
          </span>
        )}
      </div>
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'SeedNode'

export function ModalContent() { return null }
export { resultHandler } from './resultHandler'
export { ActionBarContent } from './actionBar'
