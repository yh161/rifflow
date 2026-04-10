"use client"

import React, { memo, useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NodeProps, useStore, useReactFlow } from 'reactflow'
import { cn } from '@/lib/utils'
import { Video as VideoIcon, Play, Pause } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from '../_types'
import type { HandleDef } from '../_handle'
import { GenerateVideoPanel } from '@/components/layout/node_editor/_panels'
import { resolveFileUrl } from '@/lib/file-url'

export const meta = {
  id: 'video',
  name: 'Video',
  description: 'Generated & uploaded video clips',
  icon: VideoIcon,
  color: 'text-violet-500',
  bg: 'bg-violet-50',
  border: 'hover:border-violet-200',
  opensEditor: true,
  panelTitle: 'Generate Video',
  category: 'Assets',
  modelBadge: 'Wan',
  doneColor: 'rgba(167, 139, 250, 0.55)',
}

export const defaultData: Partial<CustomNodeData> = {
  type: 'video',
  label: 'Video',
}

export const handles: HandleDef[] = [
  { id: 'in', side: 'left'  },
  { id: 'out', side: 'right' },
]

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ─────────────────────────────────────────────
// NodeUI — Video Portal Architecture
// ─────────────────────────────────────────────

const portalStateEq = (
  a: { tx: number; ty: number; zoom: number; nx: number; ny: number },
  b: { tx: number; ty: number; zoom: number; nx: number; ny: number },
) => a.tx === b.tx && a.ty === b.ty && a.zoom === b.zoom && a.nx === b.nx && a.ny === b.ny

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

  // Resolve stored key/URL to full URL for rendering
  const videoSrc   = resolveFileUrl(data.videoSrc)
  const videoPoster = resolveFileUrl(data.videoPoster)

  const videoRef    = useRef<HTMLVideoElement>(null)
  const rafRef      = useRef<number | undefined>(undefined)
  const [playing,     setPlaying]     = useState(false)
  const [hovered,     setHovered]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration,    setDuration]    = useState(0)
  const [portalEl,    setPortalEl]    = useState<HTMLElement | null>(null)

  // Scale-from-bottom-center animation when dimensions change
  const prevSizeRef = useRef({ w: data.width ?? 180, h: data.height ?? 180 })
  const [initialScale, setInitialScale] = useState<{ sx: number; sy: number } | null>(null)
  useEffect(() => {
    const dw = data.width ?? 180, dh = data.height ?? 180
    const prev = prevSizeRef.current
    if (prev.w === dw && prev.h === dh) return
    const sx = prev.w / dw, sy = prev.h / dh
    prevSizeRef.current = { w: dw, h: dh }
    setInitialScale({ sx, sy })
    requestAnimationFrame(() => requestAnimationFrame(() => setInitialScale(null)))
  }, [data.width, data.height])

  // Debounced hover — prevents flicker when cursor moves between
  // the ReactFlow placeholder and portal interactive elements.
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const setHoveredDebounced = useCallback((val: boolean) => {
    clearTimeout(hoverTimer.current)
    if (val) {
      setHovered(true)
    } else {
      hoverTimer.current = setTimeout(() => setHovered(false), 80)
    }
  }, [])

  // ReactFlow store: canvas transform + this node's position
  const portalState = useStore(
    useCallback((s: any) => {
      const [tx, ty, zoom] = s.transform
      if (!nodeId) return { tx: 0, ty: 0, zoom: 1, nx: 0, ny: 0 }
      const n = s.nodeInternals.get(nodeId)
      const p = n?.positionAbsolute ?? n?.position ?? { x: 0, y: 0 }
      return { tx, ty, zoom, nx: p.x, ny: p.y }
    }, [nodeId]),
    portalStateEq,
  )

  useEffect(() => {
    setPortalEl(document.getElementById('video-portal-root'))
  }, [])

  // RAF loop for smooth progress (60fps) while playing
  const tickProgress = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
    rafRef.current = requestAnimationFrame(tickProgress)
  }, [])

  useEffect(() => {
    if (playing) {
      rafRef.current = requestAnimationFrame(tickProgress)
    } else {
      cancelAnimationFrame(rafRef.current!)
    }
    return () => cancelAnimationFrame(rafRef.current!)
  }, [playing, tickProgress])

  useEffect(() => {
    if (!data.videoSrc && playing) {
      videoRef.current?.pause()
      setPlaying(false)
    }
  }, [data.videoSrc, playing])

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    if (playing) {
      v.pause()
      setPlaying(false)
    } else {
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }, [playing])

  // Progress bar drag
  const progressBarRef  = useRef<HTMLDivElement>(null)
  const isDraggingRef   = useRef(false)
  const wasPlayingRef   = useRef(false)

  const seekTo = useCallback((clientX: number) => {
    const v    = videoRef.current
    const bar  = progressBarRef.current
    if (!v || !bar || !duration) return
    const rect  = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = ratio * duration
    setCurrentTime(v.currentTime)
  }, [duration])

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    isDraggingRef.current  = true
    wasPlayingRef.current  = playing
    // Pause during scrub so audio doesn't stutter
    if (playing) videoRef.current?.pause()
    seekTo(e.clientX)

    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => { if (isDraggingRef.current) seekTo(ev.clientX) }
    const onUp   = () => {
      isDraggingRef.current = false
      document.body.style.userSelect = ''
      if (wasPlayingRef.current) {
        videoRef.current?.play().then(() => setPlaying(true)).catch(() => {})
      }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [playing, seekTo])

  const { tx, ty, zoom, nx, ny } = portalState
  const w = data.width  ?? 180
  const h = data.height ?? 180
  const isSelected = !!selected
  const isEditing = !!data.isEditing
  const screenX = nx * zoom + tx
  const screenY = ny * zoom + ty

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div style={{ width: w, height: h, position: 'relative' }}>
      {/* Scale wrapper: carries border + animates from bottom-center */}
      <div
        className={cn(
          'overflow-hidden',
          'bg-white/70 border',
          'transition-[box-shadow,border-color,border-radius] duration-200',
        )}
        style={{
          width: '100%', height: '100%',
          borderRadius: data.isEditing ? '0px' : '12px',
          borderColor: isSelected || isEditing
            ? 'rgba(139,92,246,0.62)'
            : (data.done === true || data.mode === 'note')
              ? 'rgba(139,92,246,0.52)'
              : 'rgba(100,116,139,0.36)',
          boxShadow: isSelected
            ? '0 6px 16px rgba(15,23,42,0.10), 0 0 0 1px rgba(139,92,246,0.20), 0 0 10px rgba(167,139,250,0.14)'
            : 'none',
          transform: initialScale ? `scaleX(${initialScale.sx}) scaleY(${initialScale.sy})` : 'scale(1)',
          transformOrigin: 'bottom center',
          transition: initialScale
            ? 'none'
            : 'transform 300ms cubic-bezier(0.4,0,0.2,1), box-shadow 180ms ease, border-color 180ms ease, border-radius 240ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
      {data.videoSrc ? (
        <>
          {/* Placeholder: fills node, receives hover/drag events.
              pointer-events pass through to ReactFlow for dragging. */}
          <div
            className="w-full h-full bg-violet-50/30"
            onMouseEnter={() => setHoveredDebounced(true)}
            onMouseLeave={() => setHoveredDebounced(false)}
          />

          {/* ── Portal: two layers — video (scaled) + controls (screen-space) ── */}
          {portalEl && createPortal(
            <>
              {/* ── Layer 1: video — scaled with zoom ── */}
              <div
                style={{
                  position:        'absolute',
                  left:            screenX,
                  top:             screenY,
                  width:           w,
                  height:          h,
                  transform:       `scale(${zoom})`,
                  transformOrigin: '0 0',
                  borderRadius:    data.isEditing ? 0 : 12,
                  transition:      'border-radius 240ms cubic-bezier(0.4,0,0.2,1)',
                  overflow:        'hidden',
                  boxSizing:       'border-box',
                  padding:         1,
                  pointerEvents:   'none',
                  userSelect:      'none',
                }}
              >
                {/* Outer: frame grows from bottom-center */}
                <div style={{
                  width: '100%', height: '100%',
                  transform: initialScale ? `scaleX(${initialScale.sx}) scaleY(${initialScale.sy})` : 'scale(1)',
                  transformOrigin: 'bottom center',
                  transition: initialScale ? 'none' : 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
                  overflow: 'hidden',
                }}>
                  {/* Inner: counter-scale keeps content stable */}
                  <div style={{
                    width: '100%', height: '100%',
                    transform: initialScale ? `scaleX(${1 / initialScale.sx}) scaleY(${1 / initialScale.sy})` : 'scale(1)',
                    transformOrigin: 'bottom center',
                    transition: initialScale ? 'none' : 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
                  }}>
                    <video
                      ref={videoRef}
                      src={videoSrc}
                      className="w-full h-full object-cover block"
                      loop
                      playsInline
                      muted
                      preload="auto"
                      onLoadedMetadata={() => {
                        const v = videoRef.current
                        if (!v) return
                        setDuration(v.duration)
                        // On first load: save natural dims + resize node to match aspect ratio
                        if (nodeId && v.videoWidth && v.videoHeight && (!data.naturalWidth || !data.naturalHeight)) {
                          const BASE = 240
                          const vw = v.videoWidth, vh = v.videoHeight
                          const newW = vw >= vh ? BASE : Math.round(BASE * vw / vh)
                          const newH = vh >= vw ? BASE : Math.round(BASE * vh / vw)
                          setNodes(ns => ns.map(n => {
                            if (n.id !== nodeId) return n
                            const oldW = (n.style?.width  as number | undefined) ?? n.data.width  ?? 180
                            const oldH = (n.style?.height as number | undefined) ?? n.data.height ?? 180
                            return {
                              ...n,
                              style:    { ...n.style, width: newW, height: newH },
                              data:     { ...n.data, naturalWidth: vw, naturalHeight: vh, width: newW, height: newH },
                              position: { x: n.position.x + (oldW - newW) / 2, y: n.position.y + (oldH - newH) },
                            }
                          }))
                        }
                      }}
                      onEnded={() => setPlaying(false)}
                      onError={() => setPlaying(false)}
                    />
                  </div>
                </div>
              </div>

              {/* ── Layer 2: controls — screen-space, no zoom scale ──
                  Positioned in actual screen pixels; controls stay crisp at any zoom.
                  Pointer-events:none on the container; only interactive children have auto. */}
              <div
                style={{
                  position:      'absolute',
                  left:          screenX,
                  top:           screenY,
                  width:         w * zoom,
                  height:        h * zoom,
                  pointerEvents: 'none',
                  userSelect:    'none',
                }}
              >
                {/* Center play button — fixed pixel size, always crisp */}
                {!playing && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ pointerEvents: 'none' }}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm cursor-pointer hover:scale-110 transition-transform duration-150"
                      style={{ pointerEvents: 'auto' }}
                      onMouseEnter={() => setHoveredDebounced(true)}
                      onMouseLeave={() => setHoveredDebounced(false)}
                      onClick={togglePlay}
                    >
                      <Play size={15} className="text-white fill-white ml-0.5" />
                    </div>
                  </div>
                )}

                {/* ── Frosted glass pill — macOS style, floats above bottom edge ──
                    Positioned 12px above bottom, centered. Width tracks node (100% - 24px).
                    Progress bar is flex-1 so it fills available space between timestamps. */}
                <div
                  className={cn(
                    'absolute bottom-3 left-0 right-0 flex justify-center px-3',
                    'transition-opacity duration-200',
                    hovered ? 'opacity-100' : 'opacity-0',
                  )}
                  style={{ pointerEvents: hovered ? 'auto' : 'none' }}
                  onMouseEnter={() => setHoveredDebounced(true)}
                  onMouseLeave={() => setHoveredDebounced(false)}
                >
                  <div
                    className="w-full flex items-center gap-2 rounded-2xl px-3 py-1.5"
                    style={{
                      maxWidth: 360,
                      background: 'rgba(0,0,0,0.42)',
                      backdropFilter: 'blur(12px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
                    }}
                  >
                    {/* Play/pause toggle */}
                    <button
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-white/15 transition-colors"
                      onClick={togglePlay}
                    >
                      {playing
                        ? <Pause size={10} className="text-white fill-white" />
                        : <Play  size={10} className="text-white fill-white ml-px" />
                      }
                    </button>

                    {/* Current time */}
                    <span className="shrink-0 text-[10px] font-medium text-white/60 tabular-nums select-none w-7 text-right">
                      {formatTime(currentTime)}
                    </span>

                    {/* Progress bar — flex-1 fills remaining space, tracks node width */}
                    <div
                      ref={progressBarRef}
                      className="relative flex-1 h-[3px] rounded-full bg-white/20 cursor-pointer group"
                      onMouseDown={handleProgressMouseDown}
                    >
                      <div
                        className="h-full rounded-full bg-white/85 transition-none relative"
                        style={{ width: `${progress * 100}%` }}
                      >
                        {/* Scrubber dot */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    {/* Duration */}
                    <span className="shrink-0 text-[10px] font-medium text-white/35 tabular-nums select-none w-7">
                      {formatTime(duration)}
                    </span>
                  </div>
                </div>
              </div>
            </>,
            portalEl,
          )}
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          <VideoIcon size={24} className="text-slate-200" />
          <span className="text-[10px] text-slate-300">Double-click to edit</span>
        </div>
      )}
      </div>{/* end scale wrapper */}
    </div>
  )
}

export const ReactFlowNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} nodeId={id} />
))
ReactFlowNode.displayName = 'VideoNode'

export function ModalContent({ data, nodeId, onUpdate, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <GenerateVideoPanel
      data={data as CustomNodeData}
      nodeId={nodeId}
      onDataChange={onUpdate as (u: Partial<CustomNodeData>) => void}
      hasSrc={!!(data as CustomNodeData).videoSrc}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
    />
  )
}
export { resultHandler } from './resultHandler'
export { ActionBarContent } from './actionBar'
