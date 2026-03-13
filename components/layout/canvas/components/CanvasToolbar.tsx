import React from "react"
import CanvasToolbar from "@/components/layout/canvas/canvas-toolbar"

interface CanvasToolbarWrapperProps {
  isSidebarOpen: boolean
  isRunning: boolean
  snapToGrid: boolean
  onSnapToggle: () => void
}

export function CanvasToolbarWrapper({
  isSidebarOpen,
  isRunning,
  snapToGrid,
  onSnapToggle,
}: CanvasToolbarWrapperProps) {
  return (
    <CanvasToolbar
      isSidebarOpen={isSidebarOpen}
      isRunning={isRunning}
      snapToGrid={snapToGrid}
      onSnapToggle={onSnapToggle}
    />
  )
}