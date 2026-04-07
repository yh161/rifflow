"use client"

import React, { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { useReactFlow, useStore } from "reactflow"
import { useSession } from "next-auth/react"
import { ZoomIn, ZoomOut, Maximize2, Grid3X3, Map as MapIcon, UploadCloud, ImageIcon, WifiOff, Loader2, Check, AlertCircle, AlignLeft, HardDrive } from "lucide-react"
import { PublishModal } from "./PublishModal"
import type { SyncStatus } from "@/hooks/useAutosave"

interface CanvasToolbarProps {
  isSidebarOpen:          boolean
  sidebarWidth?:          number
  isRunning:              boolean
  snapToGrid:             boolean
  onSnapToggle:           () => void
  syncStatus?:            SyncStatus
  minimapOpen?:           boolean
  onMinimapToggle?:       (v: boolean) => void
  currentEditingDraftId?: string | null
  onExport?:              () => void
}

// ── ZoomBadge ─────────────────────────────────────────────────────────
function ZoomBadge() {
  const zoom = useStore(s => Math.round(s.transform[2] * 100))
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

// ── Cover button (first trigger) ─────────────────────────────────────
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
      title={expanded ? "Collapse" : "Canvas controls"}
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

// ── SyncBadge ──────────────────────────────────────────────────────────
// Shows while saving, briefly shows "Saved", then fades out.
// Persistent for offline/error states.
function SyncBadge({ status }: { status?: SyncStatus }) {
  const [displayed, setDisplayed] = useState<SyncStatus | undefined>(undefined)
  const minTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<SyncStatus | undefined>(undefined)

  useEffect(() => {
    if (!status) return

    if (status === "syncing") {
      // Show "Saving" and block any update for 800ms
      pendingRef.current = undefined
      if (minTimer.current) clearTimeout(minTimer.current)
      setDisplayed("syncing")
      minTimer.current = setTimeout(() => {
        minTimer.current = null
        // Apply whatever status came in while we were locked
        setDisplayed(pendingRef.current ?? "synced")
        pendingRef.current = undefined
      }, 800)
    } else {
      if (minTimer.current) {
        // Still in the 800ms lock — queue this status
        pendingRef.current = status
      } else {
        setDisplayed(status)
      }
    }
  }, [status])

  const configs: Record<SyncStatus, { icon: React.ReactNode; label: string; className: string }> = {
    syncing: {
      icon:      <Loader2 size={11} className="animate-spin" />,
      label:     "Saving",
      className: "text-slate-400",
    },
    synced: {
      icon:      <Check size={11} />,
      label:     "Saved",
      className: "text-emerald-500",
    },
    offline: {
      icon:      <WifiOff size={11} />,
      label:     "Offline",
      className: "text-amber-500",
    },
    error: {
      icon:      <AlertCircle size={11} />,
      label:     "Sync failed",
      className: "text-red-400",
    },
  }

  if (!displayed) return null
  const c = configs[displayed]

  return (
    <div className={cn("flex items-center gap-1 px-1.5 text-[11px] font-medium select-none shrink-0", c.className)}>
      {c.icon}
      <span>{c.label}</span>
    </div>
  )
}

export default function CanvasToolbar({
  isSidebarOpen, sidebarWidth = 320, isRunning, snapToGrid, onSnapToggle,
  syncStatus,
  minimapOpen: propMinimapOpen,
  onMinimapToggle,
  currentEditingDraftId,
  onExport,
}: CanvasToolbarProps) {
  const { zoomIn, zoomOut, getNodes, setNodes, setViewport } = useReactFlow()
  const hasSelected = useStore(s => s.getNodes().some(n => n.selected))
  const { data: session } = useSession()
  const [isExpanded,    setIsExpanded]    = useState(false)
  const [showPublish,   setShowPublish]   = useState(false)
  const [coverPreview,  setCoverPreview]  = useState<string | null>(null)
  const [inlineAll,     setInlineAll]     = useState(false)

  const minimapOpen = propMinimapOpen ?? false

  const handleToggleInlineAll = () => {
    const next = !inlineAll
    setInlineAll(next)
    setNodes(ns => ns.map(n =>
      n.data?.type && n.data.type !== 'lasso'
        ? { ...n, data: { ...n.data, showPromptInline: next } }
        : n
    ))
  }

  // Restore cover thumbnail from the current editing draft after page refresh
  useEffect(() => {
    if (!currentEditingDraftId) {
      setCoverPreview(null)
      return
    }
    fetch(`/api/community/templates/${currentEditingDraftId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setCoverPreview(data?.template?.thumbnail ?? null)
      })
      .catch(() => {})
  }, [currentEditingDraftId])

  // Listen for cover changes dispatched by PublishModal or browser draft loading
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<{ url: string | null }>).detail?.url ?? null
      setCoverPreview(url)
    }
    window.addEventListener("canvas:cover-change", handler)
    return () => window.removeEventListener("canvas:cover-change", handler)
  }, [])

  const leftOffset = isSidebarOpen ? sidebarWidth + 16 : 16

  const handleFitView = () => {
    const all      = getNodes().filter(n => !n.hidden)
    const selected = all.filter(n => n.selected)
    const nodes    = selected.length > 0 ? selected : all
    if (nodes.length === 0) return

    const nodeMap = new Map(all.map(n => [n.id, n]))
    const absCache = new Map<string, { x: number; y: number }>()
    const getAbsPos = (node: typeof all[number]): { x: number; y: number } => {
      const cached = absCache.get(node.id)
      if (cached) return cached
      if (!node.parentNode) {
        const p = { x: node.position.x, y: node.position.y }
        absCache.set(node.id, p)
        return p
      }
      const parent = nodeMap.get(node.parentNode)
      if (!parent) {
        const p = { x: node.position.x, y: node.position.y }
        absCache.set(node.id, p)
        return p
      }
      const pp = getAbsPos(parent)
      const p = { x: pp.x + node.position.x, y: pp.y + node.position.y }
      absCache.set(node.id, p)
      return p
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      const w = (n.width  ?? (n.data?.width  as number | undefined) ?? 180)
      const h = (n.height ?? (n.data?.height as number | undefined) ?? 180)
      const p = getAbsPos(n)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + w)
      maxY = Math.max(maxY, p.y + h)
    }
    const boundsW = maxX - minX
    const boundsH = maxY - minY
    const sidebarW = isSidebarOpen ? sidebarWidth : 0
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
    const screenCY = visibleH / 2 - 32
    setViewport(
      { x: screenCX - flowCX * clampedZoom, y: screenCY - flowCY * clampedZoom + 16, zoom: clampedZoom },
      { duration: 450 },
    )
  }

  return (
    <>
      {/* ── Toolbar pill ── */}
      <div
        className={cn(
          "absolute z-[600] bottom-5",
          "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isRunning ? "opacity-0 pointer-events-none translate-y-3" : "opacity-100 translate-y-0",
        )}
        style={{ left: leftOffset }}
      >
        <div
          className="flex flex-row items-center bg-white/40 border border-slate-200/50 backdrop-blur-md shadow-lg shadow-black/[0.06]"
          style={{
            height:       52,
            padding:      5,
            gap:          2,
            maxWidth:     isExpanded ? 600 : 52,
            borderRadius: 14,
            overflow:     "hidden",
            transition:   "max-width 0.7s cubic-bezier(0.32,1,0.1,1)",
          }}
        >
          {/* ── Cover button / trigger ── */}
          <CoverTrigger
            coverPreview={coverPreview}
            expanded={isExpanded}
            onClick={() => setIsExpanded(v => !v)}
          />

          {/* ── Expanded controls ── */}
          <TBtn onClick={() => zoomOut({ duration: 200 })} title="Zoom out (−)">
            <ZoomOut size={15} strokeWidth={2} />
          </TBtn>

          <ZoomBadge />

          <TBtn onClick={() => zoomIn({ duration: 200 })} title="Zoom in (+)">
            <ZoomIn size={15} strokeWidth={2} />
          </TBtn>

          <Divider />

          <button
            onClick={handleFitView}
            title={hasSelected ? "Fit selected" : "Fit all"}
            className="group flex items-center px-2 h-9 rounded-xl cursor-pointer select-none transition-colors duration-150 text-slate-400 hover:text-slate-700 hover:bg-slate-50 shrink-0"
          >
            <Maximize2 size={15} strokeWidth={2} className="flex-shrink-0" />
            <span className={cn(
              "overflow-hidden whitespace-nowrap text-xs font-medium",
              "max-w-0 group-hover:max-w-[120px] pl-0 group-hover:pl-1.5",
              "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            )}>
              {hasSelected ? "Fit selected" : "Fit all"}
            </span>
          </button>

          <Divider />

          <TBtn onClick={onSnapToggle} active={snapToGrid} title={snapToGrid ? "Grid snap on" : "Enable grid snap"}>
            <Grid3X3 size={15} strokeWidth={2} />
          </TBtn>

          <TBtn
            onClick={() => onMinimapToggle?.(!minimapOpen)}
            active={minimapOpen}
            title={minimapOpen ? "Hide minimap" : "Show minimap"}
          >
            <MapIcon size={15} strokeWidth={2} />
          </TBtn>

          <TBtn onClick={handleToggleInlineAll} active={inlineAll} title={inlineAll ? "Hide all inline previews" : "Show all inline previews"}>
            <AlignLeft size={15} strokeWidth={2} />
          </TBtn>

          <Divider />

          <SyncBadge status={syncStatus} />

          {/* ── Local backup ── */}
          {onExport && (
            <TBtn onClick={onExport} title="Download local backup">
              <HardDrive size={15} strokeWidth={2} />
            </TBtn>
          )}

          {/* ── Publish button ── */}
          <TBtn onClick={() => setShowPublish(true)} title="Publish to community">
            <UploadCloud size={15} strokeWidth={2} />
          </TBtn>

        </div>

      </div>
      <PublishModal
        open={showPublish}
        onOpenChange={setShowPublish}
        currentEditingDraftId={currentEditingDraftId}
        onCoverChange={(url) => {
          setCoverPreview(url)
          window.dispatchEvent(new CustomEvent("canvas:cover-change", { detail: { url } }))
        }}
      />
    </>
  )
}
