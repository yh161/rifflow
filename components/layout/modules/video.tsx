"use client"

import React, { memo, useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NodeProps, useStore, useReactFlow } from 'reactflow'
import { cn } from '@/lib/utils'
import { Video as VideoIcon, Play, Pause } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { GenerateVideoPanel } from '@/components/layout/node_editor/_panels'

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
  const videoRef    = useRef<HTMLVideoElement>(null)
  const rafRef      = useRef<number>()
  const [playing,     setPlaying]     = useState(false)
  const [hovered,     setHovered]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration,    setDuration]    = useState(0)
  const [portalEl,    setPortalEl]    = useState<HTMLElement | null>(null)

  // Debounced hover — prevents flicker when cursor moves between
  // the ReactFlow placeholder and portal interactive elements.
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
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
  const screenX = nx * zoom + tx
  const screenY = ny * zoom + ty

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div
      className={cn(
        'overflow-hidden',
        'bg-white/70 border border-slate-300/60',
        'transition-all duration-200',
        selected && 'ring-2 ring-violet-300 ring-offset-1 border-violet-200',
      )}
      style={{
        width:        w,
        height:       h,
        borderRadius: data.isEditing ? '0px' : '12px',
        transition:   'border-radius 300ms cubic-bezier(0.4,0,0.2,1), box-shadow 200ms',
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

          {/* ── Portal: video + controls, completely outside ReactFlow ──
              Top-level wrapper is pointer-events:none so all drag/click
              events pass through to the ReactFlow node beneath. */}
          {portalEl && createPortal(
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
                overflow:        'hidden',
                pointerEvents:   'none',
                userSelect:      'none',
              }}
            >
              <video
                ref={videoRef}
                src={data.videoSrc}
                className="w-full h-full object-cover block"
                loop
                playsInline
                muted
                preload="auto"
                onLoadedMetadata={() => {
                  const v = videoRef.current
                  if (!v) return
                  setDuration(v.duration)
                  // Save natural dimensions so ResizeHandle can lock aspect ratio
                  if (nodeId && v.videoWidth && v.videoHeight && (!data.naturalWidth || !data.naturalHeight)) {
                    setNodes(ns => ns.map(n =>
                      n.id === nodeId
                        ? { ...n, data: { ...n.data, naturalWidth: v.videoWidth, naturalHeight: v.videoHeight } }
                        : n
                    ))
                  }
                }}
                onEnded={() => setPlaying(false)}
                onError={() => setPlaying(false)}
              />

              {/* Center play button — only when paused, only the button itself is interactive */}
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

              {/* Bottom control bar — visible on hover */}
              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0',
                  'transition-opacity duration-200',
                  hovered ? 'opacity-100' : 'opacity-0',
                )}
                style={{ pointerEvents: hovered ? 'auto' : 'none' }}
                onMouseEnter={() => setHoveredDebounced(true)}
                onMouseLeave={() => setHoveredDebounced(false)}
              >
                {/* Gradient scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

                <div className="relative px-2.5 pb-2 pt-4 flex flex-col gap-1.5">
                  {/* Progress bar */}
                  <div
                    ref={progressBarRef}
                    className="w-full h-1 rounded-full bg-white/30 cursor-pointer group"
                    onMouseDown={handleProgressMouseDown}
                  >
                    <div
                      className="h-full rounded-full bg-white transition-none relative"
                      style={{ width: `${progress * 100}%` }}
                    >
                      {/* Scrubber dot */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Time + pause button row */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-white/80 tabular-nums select-none">
                      {formatTime(currentTime)}
                      {duration > 0 && <span className="text-white/40"> / {formatTime(duration)}</span>}
                    </span>

                    {playing && (
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded cursor-pointer hover:bg-white/20 transition-colors"
                        onClick={togglePlay}
                      >
                        <Pause size={11} className="text-white fill-white" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            portalEl,
          )}
        </>
      ) : (
        <div className="w-full h-full bg-violet-50/60 flex flex-col items-center justify-center gap-2">
          <VideoIcon size={24} className="text-violet-200" />
          <span className="text-[10px] text-slate-300">Double-click to edit</span>
        </div>
      )}
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
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
