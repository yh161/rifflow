"use client"

import React, { useRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useReactFlow, useStoreApi } from 'reactflow'
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
const MR = 36   // magnetic radius (px, screen-space) — proximity detection
const HD = 16   // handle distance — how far outside the node edge the icon floats (node-space)
const FD = 7    // fly distance — icon start offset when hidden (node-space)

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
// centerRef holds pre-computed screen-space coords (updated via store subscription),
// so no getBoundingClientRect() reflow per frame.
// ─────────────────────────────────────────────
type ZoneEntry = {
  centerRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
  innerEl:   HTMLDivElement
  side:      HandleDef['side']
  isHovered: () => boolean
  wasClose:  { current: boolean }
}
const zones = new Set<ZoneEntry>()
let globalAttached = false

// Returns true if mouse is inside the rectangular zone matching the ::before hit area.
// For each side the rectangle starts at the node edge and extends MR*2 outward,
// MR*2 tall/wide centred on the handle — exactly matching the CSS ::before dimensions.
function inHandleRect(
  side: HandleDef['side'],
  cx: number, cy: number, zoom: number,
  mx: number, my: number,
): boolean {
  const inset = HD * zoom   // screen-space distance from icon centre to node edge
  switch (side) {
    case 'right':  return mx > cx - inset && mx < cx - inset + MR * 2 && Math.abs(my - cy) < MR
    case 'left':   return mx < cx + inset && mx > cx + inset - MR * 2 && Math.abs(my - cy) < MR
    case 'bottom': return my > cy - inset && my < cy - inset + MR * 2 && Math.abs(mx - cx) < MR
    case 'top':    return my < cy + inset && my > cy + inset - MR * 2 && Math.abs(mx - cx) < MR
  }
}

function ensureGlobalListener() {
  if (globalAttached) return
  globalAttached = true
  window.addEventListener('mousemove', (e: MouseEvent) => {
    zones.forEach(({ centerRef, innerEl, side, isHovered, wasClose }) => {
      const { x: cx, y: cy, zoom } = centerRef.current
      const dx    = e.clientX - cx
      const dy    = e.clientY - cy
      const magnetic = inHandleRect(side, cx, cy, zoom, e.clientX, e.clientY)
      const hovered  = isHovered()

      // Fly direction in screen-space (scale FD by zoom so it's proportional)
      const flyX = (side === 'left' ? FD : side === 'right' ? -FD : 0) * zoom
      const flyY = (side === 'top'  ? FD : side === 'bottom' ? -FD : 0) * zoom

      if (magnetic) {
        // Snap to mouse on entry, then track exactly with no lag
        if (!wasClose.current) {
          innerEl.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)'
          wasClose.current = true
        } else {
          innerEl.style.transition = 'none'
        }
        innerEl.style.transform = `translate(${dx}px, ${dy}px)`
      } else {
        wasClose.current = false
        innerEl.style.transition = 'transform 0.22s ease'
        // Hovering node but outside magnetic zone → rest at fixed fly-out position
        // Not hovering at all → hide at fly-back offset
        innerEl.style.transform = hovered
          ? 'translate(0px, 0px)'
          : `translate(${flyX}px, ${flyY}px)`
      }

      const svg = innerEl.querySelector('svg') as SVGElement | null
      if (svg) {
        const show = hovered || magnetic
        svg.style.strokeOpacity = show ? '1' : '0'
        svg.style.transition    = show ? 'stroke-opacity 0.12s ease' : 'stroke-opacity 0.22s ease'
        svg.style.color         = magnetic ? 'rgb(96 165 250)' : 'rgba(148,163,184,0.75)'
      }
    })
  }, { passive: true })
}

// ─────────────────────────────────────────────
// MagneticZone
//
// Visual layer rendered via portal into #handle-portal-root — completely
// outside the ReactFlow node tree. This isolates transform animations from
// the ReactFlow compositor, preventing implicit compositing of sibling nodes.
//
// Position is kept in sync with the node via useStoreApi().subscribe() —
// direct DOM writes, zero React re-renders on pan/zoom/node-move.
// ─────────────────────────────────────────────
export function MagneticZone({
  def,
  isHovered,
  nodeId,
}: {
  def:       HandleDef
  isHovered: () => boolean
  nodeId:    string
}) {
  const innerRef      = useRef<HTMLDivElement>(null)
  const portalWrapRef = useRef<HTMLDivElement>(null)
  // screen-space center of this zone, updated by store subscription
  const centerRef     = useRef({ x: 0, y: 0, zoom: 1 })
  const wasCloseRef   = useRef(false)
  const storeApi      = useStoreApi()
  const portalRoot = typeof document !== 'undefined'
    ? document.getElementById('handle-portal-root')
    : null
  const { side, offsetPercent = 50 } = def

  // Sync portal element screen-space position whenever pan/zoom/node changes.
  // Uses raw Zustand subscribe → DOM writes only, no React re-renders.
  useEffect(() => {
    if (!portalRoot) return

    const updatePos = () => {
      const state = storeApi.getState() as any
      const node  = state.nodeInternals?.get(nodeId)
      const wrap  = portalWrapRef.current
      if (!node || !wrap) return

      const [tx, ty, zoom] = state.transform
      const pos = node.positionAbsolute ?? node.position ?? { x: 0, y: 0 }
      const w   = node.width  ?? node.style?.width  ?? 200
      const h   = node.height ?? node.style?.height ?? 200

      // Icon center in node-space (HD outside the node edge)
      let hx = pos.x
      let hy = pos.y
      if (side === 'left')   { hx += -HD;    hy += h * offsetPercent / 100 }
      if (side === 'right')  { hx += w + HD; hy += h * offsetPercent / 100 }
      if (side === 'top')    { hx += w * offsetPercent / 100; hy += -HD    }
      if (side === 'bottom') { hx += w * offsetPercent / 100; hy += h + HD }

      // Convert to screen-space
      const cx = hx * zoom + tx
      const cy = hy * zoom + ty
      centerRef.current = { x: cx, y: cy, zoom }

      // Translate portal wrapper so the MR*2 zone is centred on (cx, cy)
      wrap.style.transform = `translate(${cx - MR}px, ${cy - MR}px)`

      // Scale the icon proportionally to canvas zoom
      const svgEl = innerRef.current?.querySelector('svg') as SVGElement | null
      if (svgEl) svgEl.style.transform = `scale(${zoom})`
    }

    updatePos()
    const unsub = storeApi.subscribe(updatePos)
    return unsub
  }, [nodeId, side, offsetPercent, storeApi, portalRoot])

  // Register with global mousemove handler.
  // portalRoot in deps ensures this re-runs after the portal actually renders
  // (first mount has innerRef.current === null because portal hasn't committed yet).
  useEffect(() => {
    if (!innerRef.current) return
    ensureGlobalListener()
    const entry: ZoneEntry = {
      centerRef,
      innerEl:  innerRef.current,
      side,
      isHovered,
      wasClose: wasCloseRef,
    }
    zones.add(entry)
    return () => { zones.delete(entry) }
  }, [side, isHovered, portalRoot])

  if (!portalRoot) return null

  return createPortal(
    <div
      ref={portalWrapRef}
      style={{
        position:       'absolute',
        left:           0,
        top:            0,
        // Start off-screen until store subscription positions it
        transform:      'translate(-9999px, -9999px)',
        width:          MR * 2,
        height:         MR * 2,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        pointerEvents:  'none',
      }}
    >
      <div ref={innerRef}>
        <CirclePlus
          size={18}
          strokeWidth={1.5}
          style={{ display: 'block', color: 'rgba(148,163,184,0.75)', strokeOpacity: 0 }}
        />
      </div>
    </div>,
    portalRoot,
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
      const svg  = innerEl.querySelector('svg') as SVGElement | null
      if (svg) {
        svg.style.strokeOpacity = show ? '1' : '0'
        svg.style.transition    = show ? 'stroke-opacity 0.12s ease' : 'stroke-opacity 0.22s ease'
      }
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
  cornerRadius = 12,
}: {
  nodeId:       string
  isHovered:    () => boolean
  aspectRatio?: number
  cornerRadius?: number
}) {
  const zoneRef  = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const { setNodes, getZoom } = useReactFlow()
  const [animatedCornerRadius, setAnimatedCornerRadius] = useState(cornerRadius)
  const cornerRadiusRef = useRef(cornerRadius)

  useEffect(() => {
    const from = cornerRadiusRef.current
    const to = cornerRadius
    if (Math.abs(from - to) < 0.01) return

    const duration = 220
    const start = performance.now()
    let rafId = 0

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (to - from) * eased
      cornerRadiusRef.current = next
      setAnimatedCornerRadius(next)
      if (t < 1) rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [cornerRadius])

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
  }, [nodeId, setNodes, aspectRatio, getZoom])

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
        style={{ padding: 8 }}
      >
        <svg
          width={RH_SIZE}
          height={RH_SIZE}
          viewBox="0 0 20 20"
          fill="none"
          style={{ strokeOpacity: 0 }}
        >
          <path
            d="M 2 18 Q 18 18 18 2"
            stroke="rgba(148,163,184,0.85)"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ opacity: Math.max(0, Math.min(animatedCornerRadius / 12, 1)), transition: 'opacity 140ms ease' }}
          />
          <path
            d="M 2 18 L 18 18 L 18 2"
            stroke="rgba(148,163,184,0.9)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: Math.max(0, Math.min(1 - (animatedCornerRadius / 12), 1)), transition: 'opacity 140ms ease' }}
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
