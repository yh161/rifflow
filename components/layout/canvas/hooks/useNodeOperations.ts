"use client"

import { useCallback, useRef } from "react"
import { Node, Edge } from "reactflow"
import type { AnyNodeData } from "@/components/layout/modules/_types"
import { CanvasState } from "./useCanvasState"
import { MODULE_BY_ID } from "@/components/layout/modules/_registry"

/**
 * Node operations logic extracted from canvas.tsx.
 *
 * ALL returned functions are wrapped in useCallback so their identities are
 * stable across renders. This is critical because several of them are passed
 * as props to child components that use them in useEffect deps arrays
 * (e.g. NodeEditor's onDelete dep in its inject effect).
 */
export function useNodeOperations(canvasState: CanvasState) {
  const {
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    setPendingPos,
    setDraftData,
    setEditingNode,
    setEditorNodeId,
    setQuickAddMenu,
    clearPendingState,
    clearQuickAddMenu,
  } = canvasState

  // Use a real useRef so the set persists across renders without recreating
  const deletedIdsRef = useRef<Set<string>>(new Set())

  // ─────────────────────────────────────────────
  // Node sizing helper
  // ─────────────────────────────────────────────
  const centerPosition = useCallback((type: string, position: { x: number; y: number }) => {
    const mod = MODULE_BY_ID[type]
    const w = (mod?.defaultData?.width as number | undefined) ?? 180
    const h = (mod?.defaultData?.height as number | undefined) ?? 180
    return { x: position.x - w / 2, y: position.y - h / 2 }
  }, [])

  const GHOST_NODE_ID = "__ghost_drop__"
  const GHOST_EDGE_ID = "__ghost_edge__"

  // ─────────────────────────────────────────────
  // Ghost node/edge helpers
  // ─────────────────────────────────────────────
  const removeGhost = useCallback(() => {
    setNodes((ns) => ns.filter((n) => n.id !== GHOST_NODE_ID))
    setEdges((es) => es.filter((e) => e.id !== GHOST_EDGE_ID))
  }, [setNodes, setEdges])

  const placeGhost = useCallback((
    flowPos: { x: number; y: number },
    sourceNodeId?: string,
    sourceHandleId?: string,
  ) => {
    const ghostNode: Node = {
      id: GHOST_NODE_ID,
      type: "GhostNode",
      position: { x: flowPos.x - 0.5, y: flowPos.y - 0.5 },
      data: {},
      draggable: false,
      focusable: false,
    }
    setNodes((ns) => [...ns.filter((n) => n.id !== GHOST_NODE_ID), ghostNode])

    if (sourceNodeId) {
      const ghostEdge: Edge = {
        id: GHOST_EDGE_ID,
        source: sourceNodeId,
        sourceHandle: sourceHandleId ?? null,
        target: GHOST_NODE_ID,
        targetHandle: "left",
        style: { stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "5 4" },
        animated: false,
        deletable: false,
      }
      setEdges((es) => [...es.filter((e) => e.id !== GHOST_EDGE_ID), ghostEdge])
    }
  }, [setNodes, setEdges])

  // ─────────────────────────────────────────────
  // Edge helper — must be defined before handleQuickAddSelect uses it
  // ─────────────────────────────────────────────
  const addEdge = (connection: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null; type?: string }, edges: Edge[]): Edge[] => {
    const newEdge: Edge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
      type: connection.type ?? "default",
      style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    }
    return [...edges, newEdge]
  }

  // ─────────────────────────────────────────────
  // Quick-add operations
  // ─────────────────────────────────────────────
  const openQuickAdd = useCallback((
    flowPos: { x: number; y: number },
    sourceNodeId?: string,
    sourceHandleId?: string,
  ) => {
    setQuickAddMenu({ flowPos, sourceNodeId, sourceHandleId })
    if (sourceNodeId) placeGhost(flowPos, sourceNodeId, sourceHandleId)
  }, [setQuickAddMenu, placeGhost])

  const dismissQuickAdd = useCallback(() => {
    removeGhost()
    clearQuickAddMenu()
  }, [removeGhost, clearQuickAddMenu])

  const handleQuickAddSelect = useCallback((type: string, quickAddMenu: {
    flowPos: { x: number; y: number }
    sourceNodeId?: string
    sourceHandleId?: string
  } | null) => {
    if (!quickAddMenu) return
    const mod = MODULE_BY_ID[type]
    const id = `${type}-${Date.now()}`
    const pos = quickAddMenu.sourceNodeId
      ? (() => {
          const h = (mod?.defaultData?.height as number | undefined) ?? 180
          return { x: quickAddMenu.flowPos.x, y: quickAddMenu.flowPos.y - h / 2 }
        })()
      : centerPosition(type, quickAddMenu.flowPos)

    removeGhost()

    if (type === "template" || type === "lasso") {
      setNodes((nds) => nds.map((n) => n.selected ? { ...n, selected: false } : n))
      clearQuickAddMenu()
      return
    }

    setNodes((nds) => nds.concat({
      id,
      type: type === "standard" ? "StandardNode" : "CustomNode",
      position: pos,
      data: { ...mod?.defaultData, type: type as any },
    }))

    if (quickAddMenu.sourceNodeId) {
      setEdges((es) => addEdge({
        source: quickAddMenu.sourceNodeId!,
        sourceHandle: quickAddMenu.sourceHandleId ?? null,
        target: id,
        targetHandle: null,
      }, es))
    }

    clearQuickAddMenu()

    if (MODULE_BY_ID[type]?.meta.opensEditor) setEditorNodeId(id)
  }, [centerPosition, removeGhost, setNodes, setEdges, clearQuickAddMenu, setEditorNodeId])

  // ─────────────────────────────────────────────
  // Node editing operations
  // ─────────────────────────────────────────────
  const handleNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const mod = MODULE_BY_ID[node.data?.type]
    if (mod?.meta.opensEditor) {
      setEditorNodeId((prev) => (prev === node.id ? null : node.id))
      return
    }
    setEditingNode(node as Node<AnyNodeData>)
  }, [setEditorNodeId, setEditingNode])

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node, editorNodeId: string | null) => {
    if (editorNodeId && node.id !== editorNodeId) setEditorNodeId(null)
  }, [setEditorNodeId])

  const handleEditUpdate = useCallback((data: Partial<AnyNodeData>, editingNode: Node<AnyNodeData> | null) => {
    setEditingNode((prev) => prev ? { ...prev, data: { ...prev.data, ...data } } : null)
    setNodes((nds) => nds.map((n) => {
      if (n.id !== editingNode?.id) return n
      const updatedNode: Node = { ...n, data: { ...n.data, ...data } }
      if (data.width !== undefined || data.height !== undefined) {
        updatedNode.style = {
          ...n.style,
          ...(data.width !== undefined && { width: data.width }),
          ...(data.height !== undefined && { height: data.height }),
        }
      }
      return updatedNode
    }))
  }, [setEditingNode, setNodes])

  const handleDeleteNode = useCallback((editingNode: Node<AnyNodeData> | null) => {
    if (!editingNode) return
    setNodes((nds) => nds.filter((n) => n.id !== editingNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== editingNode.id && e.target !== editingNode.id))
    setEditingNode(null)
  }, [setNodes, setEdges, setEditingNode])

  // ─────────────────────────────────────────────
  // Custom node deletion (with recursive children)
  // ─────────────────────────────────────────────
  const handleDeleteCustomNode = useCallback((id: string) => {
    setEditorNodeId(null)
    requestAnimationFrame(() => {
      setNodes((ns) => {
        const idsToRemove = new Set<string>([id])
        let changed = true
        while (changed) {
          changed = false
          for (const n of ns) {
            if (idsToRemove.has(n.id)) continue
            if (n.parentNode && idsToRemove.has(n.parentNode)) {
              idsToRemove.add(n.id)
              changed = true
              continue
            }
            if (n.data?.loopId && idsToRemove.has(n.data.loopId)) {
              idsToRemove.add(n.id)
              changed = true
            }
          }
        }
        deletedIdsRef.current = idsToRemove
        return ns.filter((n) => !idsToRemove.has(n.id))
      })
      setEdges((eds) => {
        const removed = deletedIdsRef.current
        return eds.filter((e) => !removed.has(e.source) && !removed.has(e.target))
      })
    })
  }, [setEditorNodeId, setNodes, setEdges])

  // ─────────────────────────────────────────────
  // Lasso release — strips children back to canvas
  // ─────────────────────────────────────────────
  const handleLassoRelease = useCallback((lassoId: string) => {
    setEditorNodeId(null)
    requestAnimationFrame(() => {
      setNodes((ns) => {
        const lasso = ns.find((n) => n.id === lassoId)
        if (!lasso) return ns
        return ns
          .filter((n) => n.id !== lassoId)
          .map((n) => {
            if (n.parentNode !== lassoId) return n
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { parentNode, extent, ...rest } = n
            return {
              ...rest,
              position: {
                x: lasso.position.x + n.position.x,
                y: lasso.position.y + n.position.y,
              },
            }
          })
      })
      setEdges((es) => es.filter((e) => e.source !== lassoId && e.target !== lassoId))
    })
  }, [setEditorNodeId, setNodes, setEdges])

  // ─────────────────────────────────────────────
  // Node placement operations
  // ─────────────────────────────────────────────
  const handlePlacementRequest = useCallback((
    type: string,
    position: { x: number; y: number },
    onActiveTool: (tool: string | null) => void,
  ) => {
    if (type === "template" || type === "lasso") return

    const mod = MODULE_BY_ID[type]
    onActiveTool(null)
    const centeredPos = centerPosition(type, position)

    if (MODULE_BY_ID[type]?.meta.opensEditor) {
      const id = `${type}-${Date.now()}`
      setNodes((nds) => nds.concat({
        id,
        type: type === "template" ? "TemplateNode" : type === "lasso" ? "LassoNode" : "CustomNode",
        position: centeredPos,
        ...((type === "template" || type === "lasso") && { style: { width: mod?.defaultData?.width ?? 520, height: mod?.defaultData?.height ?? 400 }, zIndex: -1 }),
        data: { ...mod?.defaultData, type: type as any },
      }))
      setEditorNodeId(id)
      return
    }

    setPendingPos({ ...centeredPos, type })
    setDraftData({ ...mod?.defaultData, type: type as any })
  }, [centerPosition, setNodes, setEditorNodeId, setPendingPos, setDraftData])

  const handleConfirmNode = useCallback((pendingPos: { x: number; y: number; type: string } | null, draftData: Partial<AnyNodeData>) => {
    if (!pendingPos) return
    const id = `${pendingPos.type}-${Date.now()}`
    setNodes((nds) => nds.concat({
      id,
      type: pendingPos.type === "standard" ? "StandardNode" : "CustomNode",
      position: { x: pendingPos.x, y: pendingPos.y },
      ...(pendingPos.type === "standard" && { style: { width: 240, height: 120 } }),
      ...(pendingPos.type === "image" && (draftData as any).width && {
        style: { width: (draftData as any).width, height: (draftData as any).height },
      }),
      data: { ...draftData },
    }))
    clearPendingState()
  }, [setNodes, clearPendingState])

  return {
    openQuickAdd,
    dismissQuickAdd,
    handleQuickAddSelect,
    handleNodeDoubleClick,
    handleNodeClick,
    handleEditUpdate,
    handleDeleteNode,
    handleDeleteCustomNode,
    handleLassoRelease,
    handlePlacementRequest,
    handleConfirmNode,
    centerPosition,
    removeGhost,
    placeGhost,
  }
}

export type NodeOperations = ReturnType<typeof useNodeOperations>