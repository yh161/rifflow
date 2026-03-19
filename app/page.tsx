"use client"

import { useState, useRef } from "react"
import { ReactFlowProvider } from "reactflow"

import Sidebar from "@/components/layout/sidebar"
import Canvas from "@/components/layout/canvas/canvas"
import CanvasToolbar from "@/components/layout/canvas/canvas-toolbar"
import Panel from "@/components/layout/browser/browser"
import Toolbar from "@/components/layout/toolbar"
import { useDemoLogs } from "@/components/layout/run-console"
import UserAvatar from "@/components/layout/user-avatar"

import LoginModal from "@/components/layout/login-modal"


export default function Screen() {
  const [activeTool, setActiveTool] = useState<string | null>(null)

  // ── Import / Export refs — populated by Canvas, consumed by Panel menu ──
  const importRef = useRef<(() => void) | null>(null)
  const exportRef = useRef<(() => void) | null>(null)

  // ── UI layout ────────────────────────────
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isPanelOpen, setIsPanelOpen] = useState(true)

  // ── Run state ────────────────────────────
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // ── Favorites — shared between Canvas (export/import) and Toolbar (quick-launch) ──
  const [favorites, setFavorites] = useState<string[]>([])
  const handleToggleFavorite = (typeId: string) =>
    setFavorites((prev) => prev.includes(typeId) ? prev.filter((x) => x !== typeId) : [...prev, typeId])
  const [preRunSidebar, setPreRunSidebar] = useState(true)
  const [preRunPanel, setPreRunPanel] = useState(true)

  const { logs, addLog } = useDemoLogs(isRunning, isPaused)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [isLoginOpen, setIsLoginOpen] = useState(true)

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
      />

      {/* Canvas toolbar — outside Canvas so it's above all canvas stacking contexts */}
      <CanvasToolbar
        isSidebarOpen={isSidebarOpen}
        isRunning={isRunning}
        snapToGrid={snapToGrid}
        onSnapToggle={() => setSnapToGrid(v => !v)}
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
        exportRef={exportRef}
      />

      <LoginModal open={isLoginOpen} onOpenChange={setIsLoginOpen} />

    </main>
    </ReactFlowProvider>
  )
}