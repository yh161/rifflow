"use client"

import { useState, useRef, useEffect } from "react"
import { ReactFlowProvider } from "reactflow"
import { useSession } from "next-auth/react"

import Sidebar from "@/components/layout/sidebar"
import Canvas from "@/components/layout/canvas/canvas"
import CanvasToolbar from "@/components/layout/canvas/canvas-toolbar"
import Panel from "@/components/layout/browser/browser"
import Toolbar from "@/components/layout/toolbar"
import { useDemoLogs } from "@/components/layout/run-console"
import UserAvatar from "@/components/layout/user-avatar"

import LoginModal from "@/components/layout/login-modal"
import type { SyncStatus } from "@/hooks/useAutosave"


export default function Screen() {
  const { status } = useSession()
  const [activeTool, setActiveTool] = useState<string | null>(null)

  // ── Import / Export refs — populated by Canvas, consumed by Panel menu ──
  const importRef = useRef<(() => void) | null>(null)
  const exportRef = useRef<(() => void) | null>(null)

  // ── Sync status — emitted by Canvas autosave, displayed in CanvasToolbar ──
  const [syncStatus, setSyncStatus] = useState<SyncStatus | undefined>(undefined)

  // ── Track which draft is currently being edited in canvas (persisted across refresh) ──
  const [currentEditingDraftId, setCurrentEditingDraftId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("currentEditingDraftId") ?? null
  })
  // Keep localStorage in sync
  useEffect(() => {
    if (currentEditingDraftId) localStorage.setItem("currentEditingDraftId", currentEditingDraftId)
    else localStorage.removeItem("currentEditingDraftId")
  }, [currentEditingDraftId])

  // ── UI layout — persisted to localStorage ────────────────────────────
  // Start with SSR-safe defaults (true), then sync from localStorage after mount
  const [isSidebarOpen, setIsSidebarOpenRaw] = useState(true)
  const [isPanelOpen, setIsPanelOpenRaw] = useState(true)

  useEffect(() => {
    const s = localStorage.getItem("ui:sidebarOpen")
    if (s !== null) setIsSidebarOpenRaw(s === "true")
    const p = localStorage.getItem("ui:panelOpen")
    if (p !== null) setIsPanelOpenRaw(p === "true")
  }, [])

  const setIsSidebarOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    setIsSidebarOpenRaw((prev) => {
      const next = typeof val === "function" ? val(prev) : val
      localStorage.setItem("ui:sidebarOpen", String(next))
      return next
    })
  }
  const setIsPanelOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    setIsPanelOpenRaw((prev) => {
      const next = typeof val === "function" ? val(prev) : val
      localStorage.setItem("ui:panelOpen", String(next))
      return next
    })
  }

  // ── Run state ────────────────────────────
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // ── Favorites — shared between Canvas (export/import) and Toolbar (quick-launch) ──
  const [favorites, setFavorites] = useState<string[]>(["text", "image", "video", "lasso"])
  const handleToggleFavorite = (typeId: string) =>
    setFavorites((prev) => prev.includes(typeId) ? prev.filter((x) => x !== typeId) : [...prev, typeId])
  const [preRunSidebar, setPreRunSidebar] = useState(true)
  const [preRunPanel, setPreRunPanel] = useState(true)

  const { logs, addLog } = useDemoLogs(isRunning, isPaused)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [minimapOpen, setMinimapOpen] = useState(false)

  // Only show login modal when unauthenticated
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  useEffect(() => {
    if (status === "unauthenticated") setIsLoginOpen(true)
    else if (status === "authenticated") setIsLoginOpen(false)
  }, [status])

  // Close browser panel when navigating to canvas (new blank or loading a draft/template)
  useEffect(() => {
    const newHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ keepPanelOpen?: boolean }>).detail
      if (!detail?.keepPanelOpen) setIsPanelOpen(false)
      // currentEditingDraftId is set by the subsequent canvas:load once blank draft is created
    }
    const loadHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ draftId?: string; keepPanelOpen?: boolean }>).detail
      if (!detail?.keepPanelOpen) setIsPanelOpen(false)
      // Only update currentEditingDraftId when an explicit draftId is provided.
      // When draftName is used (copy/import path), canvas:draft-changed fires instead.
      if (detail?.draftId !== undefined) setCurrentEditingDraftId(detail.draftId ?? null)
    }
    // canvas:draft-changed fires when a new draft is created async (copy/import flow)
    const draftChangedHandler = (e: Event) => {
      const draftId = (e as CustomEvent<{ draftId: string | null }>).detail?.draftId ?? null
      setCurrentEditingDraftId(draftId)
    }
    window.addEventListener("canvas:new",           newHandler)
    window.addEventListener("canvas:load",          loadHandler)
    window.addEventListener("canvas:draft-changed", draftChangedHandler)
    return () => {
      window.removeEventListener("canvas:new",           newHandler)
      window.removeEventListener("canvas:load",          loadHandler)
      window.removeEventListener("canvas:draft-changed", draftChangedHandler)
    }
  }, [setIsPanelOpen])

  const handleRun = () => {
    setPreRunSidebar(isSidebarOpen)
    setPreRunPanel(isPanelOpen)
    setIsSidebarOpen(false)
    setIsPanelOpen(false)
    setActiveTool(null)
    setIsRunning(true)
    setIsPaused(false)
  }
  const handlePause  = () => setIsPaused(true)
  const handleResume = () => setIsPaused(false)
  const handleStop   = () => {
    setIsRunning(false)
    setIsPaused(false)
    setTimeout(() => {
      setIsSidebarOpen(preRunSidebar)
      setIsPanelOpen(preRunPanel)
    }, 100)
  }

  return (
    <ReactFlowProvider>
    <main className="flex h-screen w-screen overflow-hidden bg-slate-50 relative">
      <Canvas
        activeTool={activeTool}
        onActiveTool={setActiveTool}
        onBgClick={() => setIsPanelOpen(false)}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        onFavoritesImport={setFavorites}
        importRef={importRef}
        exportRef={exportRef}
        isSidebarOpen={isSidebarOpen}
        isRunning={isRunning}
        snapToGrid={snapToGrid}
        onSnapToggle={() => setSnapToGrid(v => !v)}
        minimapOpen={minimapOpen}
        onSyncStatusChange={setSyncStatus}
      />

      {/* Canvas toolbar — outside Canvas so it's above all canvas stacking contexts */}
      <CanvasToolbar
        isSidebarOpen={isSidebarOpen}
        isRunning={isRunning}
        snapToGrid={snapToGrid}
        onSnapToggle={() => setSnapToGrid(v => !v)}
        minimapOpen={minimapOpen}
        onMinimapToggle={setMinimapOpen}
        syncStatus={syncStatus}
        currentEditingDraftId={currentEditingDraftId}
        onExport={() => exportRef.current?.()}
      />

      {/* Toolbar */}
      <div
        className="absolute z-30 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          left: isRunning ? 16 : (isSidebarOpen ? 320 + 16 : 16),
          top: "50%",
          transform: "translateY(-50%)",
        }}
        onClick={!isRunning ? () => setIsPanelOpen(false) : undefined}
      >
        <Toolbar
          onSelectTool={setActiveTool}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
          isRunning={isRunning}
          isPaused={isPaused}
          onRun={handleRun}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
        />
      </div>

      <UserAvatar
        isSidebarOpen={isSidebarOpen}
        isRunning={isRunning}
        // avatarUrl={user.avatarUrl}
        // displayName={user.name}
        // credits={user.credits}
      />

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isRunning={isRunning}
      />

      <Panel
        isSidebarOpen={isSidebarOpen}
        isOpen={isPanelOpen}
        onOpenChange={setIsPanelOpen}
        isRunning={isRunning}
        importRef={importRef}
        currentEditingDraftId={currentEditingDraftId}
        exportRef={exportRef}
      />

      <LoginModal open={isLoginOpen} onOpenChange={setIsLoginOpen} />

    </main>
    </ReactFlowProvider>
  )
}