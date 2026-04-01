"use client"

import { useEffect } from "react"
import type { MutableRefObject } from "react"
import type { Node, Edge } from "reactflow"
import type { CanvasState } from "./useCanvasState"

interface CreateDraftInput {
  name: string
  nodes: Node[]
  edges: Edge[]
  thumbnail?: string
  publish?: boolean
}

interface UseCanvasLifecycleParams {
  status: "loading" | "authenticated" | "unauthenticated"
  canvasState: CanvasState
  setViewportRef: MutableRefObject<(viewport: { x: number; y: number; zoom: number }) => void>
  fitViewRef: MutableRefObject<(options?: { padding?: number; duration?: number }) => void>
  saveCurrentCanvas: (opts?: { existingDraftId?: string | null; fallbackNamePrefix?: string }) => Promise<unknown>
  createDraft: (input: CreateDraftInput) => Promise<string | undefined | null>
  makeUntitledName: (prefix: string) => string
}

/**
 * Encapsulates canvas-level lifecycle events:
 * - canvas:load
 * - canvas:new
 */
export function useCanvasLifecycle({
  status,
  canvasState,
  setViewportRef,
  fitViewRef,
  saveCurrentCanvas,
  createDraft,
  makeUntitledName,
}: UseCanvasLifecycleParams) {
  const { setNodes, setEdges } = canvasState

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail
      const { nodes: loadedNodes, edges: loadedEdges, saveBefore, draftName, thumbnail } = detail

      if (saveBefore && status === "authenticated") {
        const existingId = localStorage.getItem("currentEditingDraftId")
        try { await saveCurrentCanvas({ existingDraftId: existingId }) } catch { /* silent */ }
      }

      if (Array.isArray(loadedNodes)) setNodes(loadedNodes as Parameters<typeof setNodes>[0])
      if (Array.isArray(loadedEdges)) setEdges(loadedEdges as Parameters<typeof setEdges>[0])

      if (draftName && status === "authenticated") {
        try {
          const draftId = await createDraft({
            name: draftName,
            thumbnail: thumbnail ?? undefined,
            nodes: loadedNodes ?? [],
            edges: loadedEdges ?? [],
            publish: false,
          })
          if (draftId) {
            window.dispatchEvent(new CustomEvent("canvas:draft-changed", { detail: { draftId } }))
          }
        } catch { /* silent */ }
      }

      requestAnimationFrame(() => fitViewRef.current({ padding: 0.1, duration: 400 }))
    }

    window.addEventListener("canvas:load", handler)
    return () => window.removeEventListener("canvas:load", handler)
  }, [status, setNodes, setEdges, saveCurrentCanvas, createDraft, fitViewRef])

  useEffect(() => {
    const handler = async (e: Event) => {
      const keepPanelOpen  = (e as CustomEvent).detail?.keepPanelOpen  ?? false
      const currentDraftId = (e as CustomEvent).detail?.currentDraftId ?? null

      if (status === "authenticated") {
        const currentNodes    = canvasState.nodesRef.current
        const currentEdges    = canvasState.edgesRef.current
        const currentViewport = canvasState.viewportRef.current

        try {
          await fetch("/api/draft", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ nodes: currentNodes, edges: currentEdges, viewport: currentViewport }),
          })
        } catch { /* silent */ }

        try { await saveCurrentCanvas({ existingDraftId: currentDraftId }) } catch { /* silent */ }

        try {
          const draftId = await createDraft({
            name: makeUntitledName("未命名工作流"),
            nodes: [],
            edges: [],
            publish: false,
          })
          if (draftId) {
            window.dispatchEvent(new CustomEvent("canvas:load", {
              detail: { nodes: [], edges: [], draftId, keepPanelOpen }
            }))
          }
        } catch { /* silent */ }
      } else {
        setNodes([])
        setEdges([])
        requestAnimationFrame(() => setViewportRef.current({ x: 0, y: 0, zoom: 1 }))
      }

      window.dispatchEvent(new CustomEvent("canvas:cover-change", { detail: { url: null } }))
    }

    window.addEventListener("canvas:new", handler)
    return () => window.removeEventListener("canvas:new", handler)
  }, [status, canvasState, setNodes, setEdges, setViewportRef, saveCurrentCanvas, createDraft, makeUntitledName])
}
