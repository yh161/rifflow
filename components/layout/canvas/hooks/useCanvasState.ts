"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Node, Edge } from "reactflow"
import type { AnyNodeData } from "@/components/layout/modules/_types"

/**
 * Centralized state management for the Canvas component.
 *
 * IMPORTANT: Refs (nodesRef, edgesRef) are synced via useEffect — NOT inside
 * the setState updater. This is the safe pattern used in the original canvas.tsx.
 * Wrapping setState in a callback that calls side-effects caused infinite render loops.
 */
export function useCanvasState() {
  // ── Core ReactFlow state ─────────────────────────────
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  // ── Refs for synchronous access (loop operations need current values) ──
  const nodesRef = useRef<Node[]>(nodes)
  const edgesRef = useRef<Edge[]>(edges)

  // Keep refs in sync — safe pattern: useEffect, same as original canvas.tsx
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // ── UI state ─────────────────────────────────────────
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number; type: string } | null>(null)
  const [draftData, setDraftData] = useState<Partial<AnyNodeData>>({})
  const [editingNode, setEditingNode] = useState<Node<AnyNodeData> | null>(null)
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [isDraftLoaded, setIsDraftLoaded] = useState(false)

  // ── Quick-add menu state ─────────────────────────────
  const [quickAddMenu, setQuickAddMenu] = useState<{
    flowPos: { x: number; y: number }
    sourceNodeId?: string
    sourceHandleId?: string
    sourceHandleType?: 'source' | 'target'
  } | null>(null)

  // ── Refs for edge drag and connection ────────────────
  const connectStartRef = useRef<{ nodeId: string; handleId: string | null; handleType?: 'source' | 'target' } | null>(null)
  const connectionMadeRef = useRef(false)

  // ── Loop selection ref ───────────────────────────────
  const loopSelectionRef = useRef<Node[]>([])

  // ── File input ref ────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Mouse position for ghost cursor ──────────────────
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [ghostZoom, setGhostZoom] = useState(1)

  // ── Viewport ref ─────────────────────────────────────
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 })
  const activeToolRef = useRef<string | null>(null)

  // ── Helper functions ─────────────────────────────────
  const clearPendingState = useCallback(() => {
    setPendingPos(null)
    setDraftData({})
  }, [])

  const clearQuickAddMenu = useCallback(() => {
    setQuickAddMenu(null)
  }, [])

  const updateActiveToolRef = useCallback((tool: string | null) => {
    activeToolRef.current = tool
    if (tool) setGhostZoom(viewportRef.current.zoom)
  }, [])

  const updateViewportRef = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    viewportRef.current = viewport
    if (activeToolRef.current) setGhostZoom(viewport.zoom)
  }, [])

  return {
    // State
    nodes,
    edges,
    pendingPos,
    draftData,
    editingNode,
    editorNodeId,
    snapToGrid,
    isDraftLoaded,
    quickAddMenu,
    mousePos,
    ghostZoom,

    // Refs
    connectStartRef,
    connectionMadeRef,
    loopSelectionRef,
    fileInputRef,
    edgesRef,
    nodesRef,
    viewportRef,
    activeToolRef,

    // Setters — plain React useState setters (stable, no wrapper needed)
    setNodes,
    setEdges,
    setPendingPos,
    setDraftData,
    setEditingNode,
    setEditorNodeId,
    setSnapToGrid,
    setIsDraftLoaded,
    setQuickAddMenu,
    setMousePos,
    setGhostZoom,

    // Helper functions
    clearPendingState,
    clearQuickAddMenu,
    updateActiveToolRef,
    updateViewportRef,
  }
}

export type CanvasState = ReturnType<typeof useCanvasState>
