"use client"

import React, { useRef, useEffect, useCallback } from 'react'
import { Handle, Position, useReactFlow } from 'reactflow'
import { CirclePlus } from 'lucide-react'

// ─────────────────────────────────────────────
// HandleDef — the only thing modules need to export
// to declare where their connection points live.
// ─────────────────────────────────────────────
export interface HandleDef {
  id:             string
  // left / top = target (incoming)   right / bottom = source (outgoing)
  // type is derived from side — do not specify manually
  side:           'left' | 'right' | 'top' | 'bottom'
  offsetPercent?: number
}

export const SIDE_TO_POSITION: Record<HandleDef['side'], Position> = {
  left:   Position.Left,
  right:  Position.Right,
  top:    Position.Top,
  bottom: Position.Bottom,
}

/**
 * Returns the inline style that places a ReactFlow Handle at the
/**
 * left / top → target (incoming connection)
 * right / bottom → source (outgoing connection)
 */
export function sideToHandleType(side: HandleDef['side']): 'source' | 'target' {
  return (side === 'right' || side === 'bottom') ? 'source' : 'target'
}

/**
 * Keeps the ReactFlow Handle at 1×1 exactly on the node border.
 * Edges connect here — no floating.
 * Outward hit area is provided by ::before in the CSS injection below.
 */
export function getHandleStyle(def: HandleDef): React.CSSProperties {
  const pct = def.offsetPercent ?? 50
  const base: React.CSSProperties = {
    width: 1, height: 1, opacity: 0, zIndex: 25,
    background: 'transparent', border: 'none',
    borderRadius: 0, minWidth: 0, minHeight: 0,
    overflow: 'visible',
  }
  if (def.side === 'left')   return { ...base, left:   0, top:    `${pct}%`, transform: 'translateY(-50%)' }
  if (def.side === 'right')  return { ...base, right:  0, top:    `${pct}%`, transform: 'translateY(-50%)' }
  if (def.side === 'top')    return { ...base, top:    0, left:   `${pct}%`, transform: 'translateX(-50%)' }
  return                            { ...base, bottom: 0, left:   `${pct}%`, transform: 'translateX(-50%)' }
}

/**
 * Side-specific class so CSS ::before extends in the correct outward direction.
 */
export function getHandleClassName(def: HandleDef): string {
  return `nodrag nopan nub-handle nub-handle-${def.side}`
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const MR = 36   // magnetic radius (px) — proximity detection
const HD = 16   // handle distance — how far outside the node edge the icon floats
const FD = 7    // fly distance — how far the icon starts from when invisible

// ─────────────────────────────────────────────
// One-time CSS — handle reset + outward ::before hit areas
// ─────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('__nub-handle-styles')) {
  const s = document.createElement('style')
  s.id = '__nub-handle-styles'
  s.textContent = `
    .react-flow__handle.nub-handle {
      background: transparent !important;
      border: none !important;
      border-radius: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
    }
    .react-flow__handle.nub-handle::before {
      content: '';
      position: absolute;
      pointer-events: all;
    }
    .react-flow__handle.nub-handle-left::before {
      width: ${MR * 2}px; height: ${MR * 2}px;
      right: 0; top: 50%; transform: translate(0, -50%);
    }
    .react-flow__handle.nub-handle-right::before {
      width: ${MR * 2}px; height: ${MR * 2}px;
      left: 0; top: 50%; transform: translate(0, -50%);
    }
    .react-flow__handle.nub-handle-top::before {
      width: ${MR * 2}px; height: ${MR * 2}px;
      bottom: 0; left: 50%; transform: translate(-50%, 0);
    }
    .react-flow__handle.nub-handle-bottom::before {
      width: ${MR * 2}px; height: ${MR * 2}px;
      top: 0; left: 50%; transform: translate(-50%, 0);
    }
  `
  document.head.appendChild(s)
}

// ─────────────────────────────────────────────
// Global DOM-direct mousemove loop
// All MagneticZones register here — zero React re-renders on mouse move.
// ─────────────────────────────────────────────
type ZoneEntry = {
  zoneEl:    HTMLDivElement
  innerEl:   HTMLDivElement
  side:      HandleDef['side']
  isHovered: () => boolean
}
const zones = new Set<ZoneEntry>()
let globalAttached = false

function ensureGlobalListener() {
  if (globalAttached) return
  globalAttached = true
  window.addEventListener('mousemove', (e: MouseEvent) => {
    zones.forEach(({ zoneEl, innerEl, side, isHovered }) => {
      const rect  = zoneEl.getBoundingClientRect()
      const cx    = rect.left + rect.width  / 2
      const cy    = rect.top  + rect.height / 2
      const dx    = e.clientX - cx
      const dy    = e.clientY - cy
      const dist  = Math.sqrt(dx * dx + dy * dy)
      const close = dist < MR
      const show  = isHovered() || close
      const t     = close ? 1 - dist / MR : 0

      // Fly-in start direction (away from node edge)
      const flyX  = side === 'left' ? FD : side === 'right' ? -FD : 0
      const flyY  = side === 'top'  ? FD : side === 'bottom' ? -FD : 0
      const tx    = (show ? 0 : flyX) + dx * t * 0.75
      const ty    = (show ? 0 : flyY) + dy * t * 0.75

      innerEl.style.opacity    = show ? '1' : '0'
      innerEl.style.transform  = `translate(${tx}px, ${ty}px)`
      innerEl.style.transition = close
        ? 'opacity 0.12s ease'
        : 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1)'

      const svg = innerEl.querySelector('svg') as SVGElement | null
      if (svg) {
        svg.style.color  = close ? 'rgb(96 165 250)' : 'rgba(148,163,184,0.75)'
        svg.style.filter = close ? 'drop-shadow(0 0 2px rgba(96, 165, 250, 0.36))' : 'none'
      }
    })
  }, { passive: true })
}

// ─────────────────────────────────────────────
// MagneticZone
//
// Absolutely-positioned CirclePlus that floats HD px outside the node edge,
// centred on the handle's offsetPercent position.
// isHovered() → ref-based callback from NodeWrapper (no re-renders).
// ─────────────────────────────────────────────
export function MagneticZone({
  def,
  isHovered,
}: {
  def:       HandleDef
  isHovered: () => boolean
}) {
  const zoneRef  = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const { side, offsetPercent = 50 } = def

  useEffect(() => {
    ensureGlobalListener()
    const entry: ZoneEntry = {
      zoneEl:    zoneRef.current!,
      innerEl:   innerRef.current!,
      side,
      isHovered,
    }
    zones.add(entry)
    return () => { zones.delete(entry) }
  }, [side, isHovered])

  // Zone is a MR*2 square centred exactly at (HD outside edge, offsetPercent along edge)
  const zoneStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      position: 'absolute', width: MR * 2, height: MR * 2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 20,
    }
    if (side === 'left')   return { ...base, left:   -(HD + MR), top:    `calc(${offsetPercent}% - ${MR}px)` }
    if (side === 'right')  return { ...base, right:  -(HD + MR), top:    `calc(${offsetPercent}% - ${MR}px)` }
    if (side === 'top')    return { ...base, top:    -(HD + MR), left:   `calc(${offsetPercent}% - ${MR}px)` }
    return                        { ...base, bottom: -(HD + MR), left:   `calc(${offsetPercent}% - ${MR}px)` }
  })()

  const flyX = side === 'left' ? FD : side === 'right' ? -FD : 0
  const flyY = side === 'top'  ? FD : side === 'bottom' ? -FD : 0

  return (
    <div ref={zoneRef} style={zoneStyle}>
      <div
        ref={innerRef}
        style={{ opacity: 0, transform: `translate(${flyX}px, ${flyY}px)` }}
      >
        <CirclePlus
          size={18}
          strokeWidth={1.5}
          style={{ display: 'block', color: 'rgba(148,163,184,0.75)' }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ResizeHandle — iPadOS-style corner resize grip
//
// Renders a quarter-circle arc just outside the bottom-right corner.
// Appears only when the mouse is nearby (DOM-direct, zero React re-renders).
// Drag to resize the node by updating node.style + node.data dimensions.
// ─────────────────────────────────────────────

const RH_PROXIMITY = 44   // px — hover detection radius
const RH_SIZE      = 20   // SVG width / height (px)
const RH_MIN_W     = 80   // minimum node width  (flow units)
const RH_MIN_H     = 60   // minimum node height (flow units)

type ResizeZoneEntry = {
  zoneEl:    HTMLDivElement
  innerEl:   HTMLDivElement
  isHovered: () => boolean
}

type DragState = {
  nodeId:       string
  startX:       number
  startY:       number
  startW:       number
  startH:       number
  setNodes:     (fn: (nodes: any[]) => any[]) => void
  getZoom:      () => number
  aspectRatio?: number   // w/h — when set, height is derived from width
}

const resizeZones          = new Set<ResizeZoneEntry>()
let   resizeListenerReady  = false
let   activeDrag: DragState | null = null

function ensureResizeListeners() {
  if (resizeListenerReady) return
  resizeListenerReady = true

  window.addEventListener('mousemove', (e: MouseEvent) => {
    // ── proximity show/hide ──────────────────────
    resizeZones.forEach(({ zoneEl, innerEl, isHovered }) => {
      const rect = zoneEl.getBoundingClientRect()
      const cx   = rect.left + rect.width  / 2
      const cy   = rect.top  + rect.height / 2
      const dist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2)
      const show = isHovered() || dist < RH_PROXIMITY
      innerEl.style.opacity   = show ? '1' : '0'
      innerEl.style.transition = show ? 'opacity 0.12s ease' : 'opacity 0.22s ease'
    })

    // ── drag resize ──────────────────────────────
    if (!activeDrag) return
    const zoom = activeDrag.getZoom()
    const dx   = (e.clientX - activeDrag.startX) / zoom
    const dy   = (e.clientY - activeDrag.startY) / zoom
    let newW = Math.max(RH_MIN_W, activeDrag.startW + dx)
    let newH = Math.max(RH_MIN_H, activeDrag.startH + dy)
    if (activeDrag.aspectRatio) {
      // Lock aspect ratio: width drives, height is derived.
      // If the derived height would be too small, flip and let height drive.
      const ar = activeDrag.aspectRatio
      newH = newW / ar
      if (newH < RH_MIN_H) { newH = RH_MIN_H; newW = newH * ar }
    }
    activeDrag.setNodes((nodes: any[]) =>
      nodes.map((n) => {
        if (n.id !== activeDrag!.nodeId) return n
        return {
          ...n,
          style: { ...n.style, width: newW, height: newH },
          data:  { ...n.data,  width: newW, height: newH },
        }
      })
    )
  }, { passive: true })

  window.addEventListener('mouseup', () => {
    if (activeDrag) {
      activeDrag = null
      document.body.style.userSelect = ''
      document.body.style.cursor     = ''
    }
  })
}

export function ResizeHandle({
  nodeId,
  isHovered,
  aspectRatio,
}: {
  nodeId:       string
  isHovered:    () => boolean
  aspectRatio?: number
}) {
  const zoneRef  = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const { setNodes, getZoom } = useReactFlow()

  useEffect(() => {
    ensureResizeListeners()
    const entry: ResizeZoneEntry = {
      zoneEl:    zoneRef.current!,
      innerEl:   innerRef.current!,
      isHovered,
    }
    resizeZones.add(entry)
    return () => { resizeZones.delete(entry) }
  }, [isHovered])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const nodeEl = zoneRef.current?.closest('.react-flow__node') as HTMLElement | null
    if (!nodeEl) return
    const rect = nodeEl.getBoundingClientRect()
    const z    = getZoom()
    activeDrag = {
      nodeId,
      startX:      e.clientX,
      startY:      e.clientY,
      startW:      rect.width  / z,
      startH:      rect.height / z,
      setNodes,
      getZoom,
      aspectRatio,
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor     = 'nwse-resize'
  }, [nodeId, setNodes])

  return (
    <div
      ref={zoneRef}
      style={{
        position:      'absolute',
        bottom:        -(RH_SIZE + 8),
        right:         -(RH_SIZE + 8),
        width:         RH_SIZE + 24,
        height:        RH_SIZE + 24,
        display:       'flex',
        alignItems:    'flex-start',
        justifyContent:'flex-start',
        // pointerEvents: 'none' — prevents overflow pointer-events from
        // triggering Chromium compositor layer promotion on the node,
        // which would rasterize the node at zoom=1 and scale it up → blur.
        pointerEvents: 'none',
        zIndex:        30,
      }}
    >
      <div
        ref={innerRef}
        style={{ opacity: 0, padding: 8 }}
      >
        <svg
          width={RH_SIZE}
          height={RH_SIZE}
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="M 2 18 Q 18 18 18 2"
            stroke="rgba(148,163,184,0.85)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {/* Interactive target sits at the node's corner (inside bounds) so it
          never creates an overflow hit-region that forces layer promotion. */}
      <div
        className="nodrag nopan"
        style={{
          position:      'absolute',
          bottom:        RH_SIZE + 8,
          right:         RH_SIZE + 8,
          width:         RH_SIZE,
          height:        RH_SIZE,
          pointerEvents: 'all',
          cursor:        'nwse-resize',
        }}
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}

// Re-export for NodeWrapper convenience
export { Handle, Position }