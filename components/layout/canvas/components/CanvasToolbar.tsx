import React from "react"
import CanvasToolbar from "@/components/layout/canvas/canvas-toolbar"
import type { SyncStatus } from "@/hooks/useAutosave"

interface CanvasToolbarWrapperProps {
  isSidebarOpen: boolean
  isRunning: boolean
  snapToGrid: boolean
  onSnapToggle: () => void
  minimapOpen?: boolean
  onMinimapToggle?: (v: boolean) => void
  syncStatus?: SyncStatus
}

export function CanvasToolbarWrapper({
  isSidebarOpen,
  isRunning,
  snapToGrid,
  onSnapToggle,
  minimapOpen = false,
  onMinimapToggle = () => {},
  syncStatus,
}: CanvasToolbarWrapperProps) {
  return (
    <CanvasToolbar
      isSidebarOpen={isSidebarOpen}
      isRunning={isRunning}
      snapToGrid={snapToGrid}
      onSnapToggle={onSnapToggle}
      minimapOpen={minimapOpen}
      onMinimapToggle={onMinimapToggle}
      syncStatus={syncStatus}
    />
  )
}
