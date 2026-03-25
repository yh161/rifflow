import React from "react"
import CanvasToolbar from "@/components/layout/canvas/canvas-toolbar"

interface CanvasToolbarWrapperProps {
  isSidebarOpen: boolean
  isRunning: boolean
  snapToGrid: boolean
  onSnapToggle: () => void
  minimapOpen?: boolean
  onMinimapToggle?: (v: boolean) => void
}

export function CanvasToolbarWrapper({
  isSidebarOpen,
  isRunning,
  snapToGrid,
  onSnapToggle,
  minimapOpen = false,
  onMinimapToggle = () => {},
}: CanvasToolbarWrapperProps) {
  return (
    <CanvasToolbar
      isSidebarOpen={isSidebarOpen}
      isRunning={isRunning}
      snapToGrid={snapToGrid}
      onSnapToggle={onSnapToggle}
      minimapOpen={minimapOpen}
      onMinimapToggle={onMinimapToggle}
    />
  )
}