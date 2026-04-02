"use client"

import React, { memo, useRef, useEffect, useCallback } from 'react'
import { NodeProps } from 'reactflow'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CustomNodeData } from '../_types'
import type { HandleDef } from '../_handle'
import { HybridEditor, mdClasses } from '../text'

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

  const onChange = (content: string) => data.onDataChange?.({ content })

  const w = data.width  ?? 180
  const h = data.height ?? 180

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden transition-[box-shadow,border-color] duration-150 rounded-[14px]',
        'bg-violet-50/80 border border-violet-200/60',
        selected       && 'border-violet-400/70 bg-violet-50/90',
        data.isEditing && '!border-violet-500',
      )}
      style={{ width: w, height: h, borderRadius: 14 }}
    >
      {/* Content */}
      <div className="flex-1 px-2.5 py-2 min-h-0 overflow-hidden">
        {(data.isEditing || data.content) ? (
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
                mdClasses,
                "pr-2",
                data.isEditing && "nodrag nopan",
              )}
            >
              <HybridEditor
                initialContent={data.content ?? ''}
                onChange={onChange}
                editable={!!data.isEditing && !!selected}
              />
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
