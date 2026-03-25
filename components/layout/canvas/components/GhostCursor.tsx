import React from "react"
import { StandardNodeUI, CustomNodeUI } from "@/components/layout/modules/_registry"
import type { CustomNodeData } from "@/components/layout/modules/_types"

interface GhostCursorProps {
  activeTool: string | null
  mousePos: { x: number; y: number }
  ghostZoom: number
}

export function GhostCursor({ activeTool, mousePos, ghostZoom }: GhostCursorProps) {
  // Ghost cursor only for regular node types (standard, text, image, video, filter, seed, etc.)
  // Container types (template, lasso) are created via drag-selection, not click placement
  if (!activeTool || activeTool === "template" || activeTool === "lasso") return null

  return (
    <div
      className="is-ghost fixed pointer-events-none z-[9999] opacity-40"
      style={{ left: mousePos.x, top: mousePos.y, transform: `translate(-50%, -50%) scale(${ghostZoom})` }}
    >
      {activeTool === "standard" ? (
        <StandardNodeUI data={{ name: "New Node", subType: "Standard" }} />
      ) : (
        <CustomNodeUI data={{ type: activeTool as CustomNodeData["type"], label: `New ${activeTool}` }} />
      )}
    </div>
  )
}
