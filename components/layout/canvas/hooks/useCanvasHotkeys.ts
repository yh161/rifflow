"use client"

import { useEffect } from "react"
import type { Node } from "reactflow"
import type { CanvasState } from "./useCanvasState"

interface UseCanvasHotkeysParams {
  canvasState: CanvasState
  getNodes: () => Node[]
  getViewport: () => { x: number; y: number; zoom: number }
  handleUndo: () => void
  handleRedo: () => void
  handleCopyNodes: (nodeIds: string[]) => void
  pasteFromNodeClipboard: (flowX: number, flowY: number) => boolean
  hasCopiedNodes: () => boolean
}

export function useCanvasHotkeys({
  canvasState,
  getNodes,
  getViewport,
  handleUndo,
  handleRedo,
  handleCopyNodes,
  pasteFromNodeClipboard,
  hasCopiedNodes,
}: UseCanvasHotkeysParams) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable
      if (isEditing) return

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault()
        handleRedo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault()
        handleRedo()
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault()
        const selected = getNodes().filter(n => n.selected && n.type !== "LassoNode")
        if (selected.length === 0) return

        const OFFSET = 24
        const now = Date.now()
        const idMap = new Map(selected.map((n, i) => [n.id, `node-dup-${now}-${i}`]))
        const newNodes = selected.map(n => ({
          ...n,
          id: idMap.get(n.id)!,
          selected: false,
          position: { x: n.position.x + OFFSET, y: n.position.y + OFFSET },
          data: { ...n.data },
        }))

        const idSet = new Set(selected.map(n => n.id))
        const seen = new Set<string>()
        const newEdges = canvasState.edgesRef.current
          .filter(e => idSet.has(e.source) || idSet.has(e.target))
          .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true })
          .map((e, i) => ({
            ...e,
            id: `edge-dup-${now}-${i}`,
            source: idMap.get(e.source) ?? e.source,
            target: idMap.get(e.target) ?? e.target,
          }))

        canvasState.setNodes(nds => [...nds, ...newNodes])
        canvasState.setEdges(eds => [...eds, ...newEdges])
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        const selected = getNodes().filter(n => n.selected && n.type !== "LassoNode")
        if (selected.length > 0) handleCopyNodes(selected.map(n => n.id))
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        if (hasCopiedNodes()) {
          e.preventDefault()
          const vp = getViewport()
          const cx = (window.innerWidth / 2 - vp.x) / vp.zoom
          const cy = (window.innerHeight / 2 - vp.y) / vp.zoom
          pasteFromNodeClipboard(cx, cy)
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [canvasState, getNodes, getViewport, handleUndo, handleRedo, handleCopyNodes, pasteFromNodeClipboard, hasCopiedNodes])
}
