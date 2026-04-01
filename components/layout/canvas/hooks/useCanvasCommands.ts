"use client"

import { useCallback, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import type { Node } from "reactflow"
import type { CanvasState } from "./useCanvasState"
import { MODULE_BY_ID } from "@/components/layout/modules/_registry"

interface UseCanvasCommandsParams {
  canvasState: CanvasState
  getNodes: () => Node[]
  setViewportRef: MutableRefObject<(viewport: { x: number; y: number; zoom: number }) => void>
  skipAutosaveRef: MutableRefObject<boolean>
  contextMenu: { x: number; y: number; flowX: number; flowY: number } | null
  onFavoritesRestore: (favorites: string[]) => void
}

export function useCanvasCommands({
  canvasState,
  getNodes,
  setViewportRef,
  skipAutosaveRef,
  contextMenu,
  onFavoritesRestore,
}: UseCanvasCommandsParams) {
  const [undoInFlight, setUndoInFlight] = useState(false)
  const [redoInFlight, setRedoInFlight] = useState(false)
  const [pasteInFlight, setPasteInFlight] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)

  const copiedNodesRef = useRef<Node[]>([])

  const handleUndo = useCallback(async () => {
    if (undoInFlight) return
    setUndoInFlight(true)
    try {
      const res = await fetch("/api/draft/undo", { method: "POST" })
      if (!res.ok) {
        if (res.status === 404) console.log("[undo] Nothing to undo")
        return
      }
      const data = await res.json()
      const restoredNodes = data.nodesJson
      const restoredEdges = data.edgesJson
      const restoredVp = data.viewportJson
      const restoredFavorites = Array.isArray(restoredVp?.favorites)
        ? restoredVp.favorites.filter((x: unknown): x is string => typeof x === "string")
        : []

      skipAutosaveRef.current = true
      canvasState.setNodes(Array.isArray(restoredNodes) ? restoredNodes : [])
      canvasState.setEdges(Array.isArray(restoredEdges) ? restoredEdges : [])
      if (restoredVp && typeof restoredVp.x === "number") {
        requestAnimationFrame(() => setViewportRef.current({ x: restoredVp.x, y: restoredVp.y, zoom: restoredVp.zoom }))
      }
      onFavoritesRestore(restoredFavorites)
      canvasState.viewportRef.current = restoredVp ?? { x: 0, y: 0, zoom: 1 }
      setUndoCount(data.undoCount ?? 0)
      setRedoCount(data.redoCount ?? 0)
    } catch (err) {
      console.error("[undo] Failed:", err)
    } finally {
      setUndoInFlight(false)
    }
  }, [undoInFlight, canvasState, setViewportRef, skipAutosaveRef, onFavoritesRestore])

  const handleRedo = useCallback(async () => {
    if (redoInFlight) return
    setRedoInFlight(true)
    try {
      const res = await fetch("/api/draft/redo", { method: "POST" })
      if (!res.ok) {
        if (res.status === 404) console.log("[redo] Nothing to redo")
        return
      }
      const data = await res.json()
      const restoredNodes = data.nodesJson
      const restoredEdges = data.edgesJson
      const restoredVp = data.viewportJson
      const restoredFavorites = Array.isArray(restoredVp?.favorites)
        ? restoredVp.favorites.filter((x: unknown): x is string => typeof x === "string")
        : []

      skipAutosaveRef.current = true
      canvasState.setNodes(Array.isArray(restoredNodes) ? restoredNodes : [])
      canvasState.setEdges(Array.isArray(restoredEdges) ? restoredEdges : [])
      if (restoredVp && typeof restoredVp.x === "number") {
        requestAnimationFrame(() => setViewportRef.current({ x: restoredVp.x, y: restoredVp.y, zoom: restoredVp.zoom }))
      }
      onFavoritesRestore(restoredFavorites)
      canvasState.viewportRef.current = restoredVp ?? { x: 0, y: 0, zoom: 1 }
      setUndoCount(data.undoCount ?? 0)
      setRedoCount(data.redoCount ?? 0)
    } catch (err) {
      console.error("[redo] Failed:", err)
    } finally {
      setRedoInFlight(false)
    }
  }, [redoInFlight, canvasState, setViewportRef, skipAutosaveRef, onFavoritesRestore])

  const handleCopyNodes = useCallback((nodeIds: string[]) => {
    const idSet = new Set(nodeIds)
    copiedNodesRef.current = getNodes().filter(n => idSet.has(n.id))
  }, [getNodes])

  const hasCopiedNodes = useCallback(() => copiedNodesRef.current.length > 0, [])

  const pasteFromNodeClipboard = useCallback((flowX: number, flowY: number) => {
    const copied = copiedNodesRef.current
    if (copied.length === 0) return false
    const minX = Math.min(...copied.map(n => n.position.x))
    const minY = Math.min(...copied.map(n => n.position.y))
    const now = Date.now()
    const newNodes = copied.map((n, i) => ({
      ...n,
      id: `${n.id}-copy-${now}-${i}`,
      selected: false,
      position: { x: flowX + (n.position.x - minX), y: flowY + (n.position.y - minY) },
      data: { ...n.data },
    }))
    canvasState.setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes])
    return true
  }, [canvasState])

  const handlePaste = useCallback(async () => {
    if (pasteInFlight || !contextMenu) return
    if (pasteFromNodeClipboard(contextMenu.flowX, contextMenu.flowY)) return
    setPasteInFlight(true)

    try {
      const clipboardItems = await navigator.clipboard.read()

      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const tempUrl = URL.createObjectURL(blob)

          const img = new Image()
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject()
            img.src = tempUrl
          })

          const naturalWidth = img.naturalWidth
          const naturalHeight = img.naturalHeight
          const aspectRatio = naturalWidth / naturalHeight

          const maxDim = 240
          let displayWidth = naturalWidth
          let displayHeight = naturalHeight

          if (naturalWidth > maxDim || naturalHeight > maxDim) {
            if (aspectRatio >= 1) {
              displayWidth = maxDim
              displayHeight = maxDim / aspectRatio
            } else {
              displayHeight = maxDim
              displayWidth = maxDim * aspectRatio
            }
          }

          const id = `image-${Date.now()}`
          canvasState.setNodes((nds) => nds.concat({
            id,
            type: "CustomNode",
            position: {
              x: contextMenu.flowX - displayWidth / 2,
              y: contextMenu.flowY - displayHeight / 2
            },
            style: { width: displayWidth, height: displayHeight },
            data: {
              type: 'image',
              label: 'Image',
              src: tempUrl,
              naturalWidth,
              naturalHeight,
              width: displayWidth,
              height: displayHeight,
            },
          }))

          void (async () => {
            try {
              const mimeType = blob.type || imageType
              const ext = mimeType.split('/')[1]?.split('+')[0] || 'png'
              const file = new File([blob], `paste.${ext}`, { type: mimeType })
              const form = new FormData()
              form.append('file', file)
              const res = await fetch('/api/upload', { method: 'POST', body: form })
              if (!res.ok) return
              const { url: persistentUrl } = await res.json()
              if (!persistentUrl) return

              canvasState.setNodes((nds) => nds.map((n) => {
                if (n.id !== id) return n
                return { ...n, data: { ...n.data, src: persistentUrl } }
              }))
              URL.revokeObjectURL(tempUrl)
            } catch {
              // keep temporary url
            }
          })()

          return
        }

        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          const text = await blob.text()

          if (text.trim()) {
            const id = `text-${Date.now()}`
            const textMod = MODULE_BY_ID["text"]
            const defaultW = (textMod?.defaultData?.width as number | undefined) ?? 180
            const defaultH = (textMod?.defaultData?.height as number | undefined) ?? 180

            canvasState.setNodes((nds) => nds.concat({
              id,
              type: "CustomNode",
              position: {
                x: contextMenu.flowX - defaultW / 2,
                y: contextMenu.flowY - defaultH / 2
              },
              data: {
                type: 'text',
                label: 'Text',
                content: text,
                align: 'left',
              },
            }))
            return
          }
        }
      }
    } catch (err) {
      console.error("[paste] Failed:", err)
    } finally {
      setPasteInFlight(false)
    }
  }, [pasteInFlight, contextMenu, pasteFromNodeClipboard, canvasState])

  const handleDuplicateNode = useCallback((nodeId: string) => {
    const node = getNodes().find(n => n.id === nodeId)
    if (!node) return
    const newId = `node-dup-${Date.now()}`
    const OFFSET = 24
    const now = Date.now()
    const allEdges = canvasState.edgesRef.current
    const connectedEdges = allEdges.filter(e => e.source === nodeId || e.target === nodeId)
    const newEdges = connectedEdges.map((e, i) => ({
      ...e,
      id: `edge-dup-${now}-${i}`,
      source: e.source === nodeId ? newId : e.source,
      target: e.target === nodeId ? newId : e.target,
    }))
    canvasState.setNodes(nds => [...nds, {
      ...node,
      id: newId,
      selected: false,
      position: { x: node.position.x + OFFSET, y: node.position.y + OFFSET },
      data: { ...node.data },
    }])
    if (newEdges.length > 0) canvasState.setEdges(eds => [...eds, ...newEdges])
  }, [getNodes, canvasState])

  return {
    undoInFlight,
    redoInFlight,
    pasteInFlight,
    undoCount,
    redoCount,
    setUndoCount,
    setRedoCount,
    handleUndo,
    handleRedo,
    handleCopyNodes,
    hasCopiedNodes,
    pasteFromNodeClipboard,
    handlePaste,
    handleDuplicateNode,
  }
}
