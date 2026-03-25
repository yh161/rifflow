"use client"

import React, { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { useReactFlow, MiniMap } from "reactflow"
import { useSession } from "next-auth/react"
import { ZoomIn, ZoomOut, Maximize2, Grid3X3, Map, UploadCloud, ImageIcon } from "lucide-react"
import { PublishModal } from "./PublishModal"

interface CanvasToolbarProps {
  isSidebarOpen: boolean
  isRunning:     boolean
  snapToGrid:    boolean
  onSnapToggle:  () => void
  /** canvas 快照，由外层传入（nodes + edges） */
  canvasSnapshot?: { nodes: unknown[]; edges: unknown[] }
}

// ── ZoomBadge ─────────────────────────────────────────────────────────
function ZoomBadge() {
  const { getZoom } = useReactFlow()
  const [zoom, setZoom] = useState(() => Math.round(getZoom() * 100))
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const tick = () => {
      setZoom(Math.round(getZoom() * 100))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [getZoom])
  return (
    <span className="text-[11px] font-medium tabular-nums text-slate-400 w-8 text-center select-none shrink-0">
      {zoom}%
    </span>
  )
}

function Divider() {
  return <div className="h-5 w-px bg-slate-200 mx-0.5 shrink-0" />
}

function TBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} className={cn(
      "w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-150 shrink-0",
      active
        ? "bg-slate-200 text-slate-700"
        : "text-slate-400 hover:text-slate-700 hover:bg-slate-50",
    )}>
      {children}
    </button>
  )
}

// ── 封面按钮（首个 trigger）──────────────────────────────────────────
function CoverTrigger({
  coverPreview, expanded, onClick,
}: {
  coverPreview: string | null
  expanded: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={expanded ? "收起" : "画布控制"}
      className={cn(
        "w-10 h-10 shrink-0 rounded-[10px] overflow-hidden",
        "flex items-center justify-center transition-all duration-150",
        coverPreview
          ? "ring-1 ring-slate-200"
          : "bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600",
      )}
    >
      {coverPreview
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={coverPreview} alt="canvas cover" className="w-full h-full object-cover" />
        : <ImageIcon size={14} strokeWidth={2} />
      }
    </button>
  )
}

export default function CanvasToolbar({
  isSidebarOpen, isRunning, snapToGrid, onSnapToggle,
  canvasSnapshot = { nodes: [], edges: [] },
}: CanvasToolbarProps) {
  const { zoomIn, zoomOut, getNodes, setViewport } = useReactFlow()
  const { data: session } = useSession()
  const [isExpanded,    setIsExpanded]    = useState(false)
  const [showMinimap,   setShowMinimap]   = useState(false)
  const [showPublish,   setShowPublish]   = useState(false)
  const [coverPreview,  setCoverPreview]  = useState<string | null>(null)

  // Restore cover thumbnail from the latest saved draft after page refresh
  useEffect(() => {
    if (!session?.user?.id) return
    fetch(`/api/community/templates?creatorId=${session.user.id}&status=draft&limit=1&orderBy=newest`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const latest = data?.templates?.[0]
        if (latest?.thumbnail) setCoverPreview(latest.thumbnail)
      })
      .catch(() => {})
  }, [session?.user?.id])

  const leftOffset = isSidebarOpen ? 336 : 16

  useEffect(() => { if (!isExpanded) setShowMinimap(false) }, [isExpanded])
  const minimapVisible = showMinimap && isExpanded && !isRunning

  const handleFitView = () => {
    const nodes = getNodes().filter(n => !n.hidden)
    if (nodes.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      const w = (n.width  ?? (n.data?.width  as number | undefined) ?? 180)
      const h = (n.height ?? (n.data?.height as number | undefined) ?? 180)
      minX = Math.min(minX, n.position.x)
      minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + w)
      maxY = Math.max(maxY, n.position.y + h)
    }
    const boundsW = maxX - minX
    const boundsH = maxY - minY
    const sidebarW = isSidebarOpen ? 320 : 0
    const screenW  = window.innerWidth
    const screenH  = window.innerHeight
    const visibleX = sidebarW
    const visibleW = screenW - sidebarW
    const visibleH = screenH
    const PAD      = 0.15
    const zoom     = Math.min(
      (visibleW * (1 - 2 * PAD)) / boundsW,
      (visibleH * (1 - 2 * PAD)) / boundsH,
      10,
    )
    const clampedZoom = Math.max(0.1, zoom)
    const flowCX  = minX + boundsW / 2
    const flowCY  = minY + boundsH / 2
    const screenCX = visibleX + visibleW / 2
    const screenCY = visibleH / 2
    setViewport(
      { x: screenCX - flowCX * clampedZoom, y: screenCY - flowCY * clampedZoom, zoom: clampedZoom },
      { duration: 450 },
    )
  }

  return (
    <>
      {/* ── Pill（圆角矩形）── */}
      <div
        className={cn(
          "absolute z-[600] bottom-5",
          "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isRunning ? "opacity-0 pointer-events-none translate-y-3" : "opacity-100 translate-y-0",
        )}
        style={{ left: leftOffset }}
      >
        <div
          className="flex flex-row items-center bg-white/80 border border-slate-200/60 backdrop-blur-xl shadow-lg shadow-black/[0.06]"
          style={{
            height:       52,
            padding:      5,
            gap:          2,
            maxWidth:     isExpanded ? 600 : 52,
            borderRadius: 14,             // ← 圆角矩形（原为 26）
            overflow:     "hidden",
            transition:   "max-width 0.7s cubic-bezier(0.32,1,0.1,1)",
          }}
        >
          {/* ── 封面按钮 / Trigger ── */}
          <CoverTrigger
            coverPreview={coverPreview}
            expanded={isExpanded}
            onClick={() => setIsExpanded(v => !v)}
          />

          {/* ── 展开内容 ── */}
          <TBtn onClick={() => zoomOut({ duration: 200 })} title="Zoom out (−)">
            <ZoomOut size={15} strokeWidth={2} />
          </TBtn>

          <ZoomBadge />

          <TBtn onClick={() => zoomIn({ duration: 200 })} title="Zoom in (+)">
            <ZoomIn size={15} strokeWidth={2} />
          </TBtn>

          <Divider />

          <TBtn onClick={handleFitView} title="Fit all nodes">
            <Maximize2 size={15} strokeWidth={2} />
          </TBtn>

          <Divider />

          <TBtn onClick={onSnapToggle} active={snapToGrid} title={snapToGrid ? "Grid snap on" : "Enable grid snap"}>
            <Grid3X3 size={15} strokeWidth={2} />
          </TBtn>

          <TBtn onClick={() => setShowMinimap(v => !v)} active={showMinimap} title={showMinimap ? "Hide minimap" : "Show minimap"}>
            <Map size={15} strokeWidth={2} />
          </TBtn>

          <Divider />

          {/* ── 发布按钮 ── */}
          <TBtn onClick={() => setShowPublish(true)} title="发布到社区">
            <UploadCloud size={15} strokeWidth={2} />
          </TBtn>

        </div>
      </div>

      {/* ── Minimap ── */}
      <MiniMap
        zoomable pannable
        nodeStrokeWidth={2}
        nodeColor="#cbd5e1"
        maskColor="rgba(241,245,249,0.65)"
        style={{
          position:   "absolute",
          bottom:     80, left: leftOffset, right: "unset" as any,
          width:      192, height: 128,
          background: "rgba(255,255,255,0.85)",
          borderRadius: 16,
          border:     "1px solid rgba(226,232,240,0.6)",
          boxShadow:  "0 4px 24px rgba(0,0,0,0.06)",
          opacity:     minimapVisible ? 1 : 0,
          pointerEvents: minimapVisible ? "auto" : "none",
          transform:   minimapVisible ? "translateY(0)" : "translateY(6px)",
          transition:  "opacity 0.3s ease, transform 0.3s ease",
          zIndex:      600,
        }}
      />

      <PublishModal
        open={showPublish}
        onOpenChange={(v) => {
          setShowPublish(v)

        }}
        canvasSnapshot={canvasSnapshot}
        onCoverChange={setCoverPreview}
      />
    </>
  )
}
