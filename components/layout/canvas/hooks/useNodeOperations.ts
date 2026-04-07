"use client"

import { useCallback, useRef } from "react"
import { Node, Edge } from "reactflow"
import type { AnyNodeData } from "@/components/layout/modules/_types"
import { CanvasState } from "./useCanvasState"
import { MODULE_BY_ID } from "@/components/layout/modules/_registry"

type HandleSide = 'left' | 'right' | 'top' | 'bottom'

function sideToHandleType(side: HandleSide): 'source' | 'target' {
  return (side === 'right' || side === 'bottom') ? 'source' : 'target'
}

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

  const getAnchoredNodePlacement = useCallback((
    type: string,
    anchor: { x: number; y: number },
    desiredHandleType: 'source' | 'target',
  ) => {
    const mod = MODULE_BY_ID[type]
    const w = (mod?.defaultData?.width as number | undefined) ?? 180
    const h = (mod?.defaultData?.height as number | undefined) ?? 180
    const handles = (mod?.handles as Array<{ id: string; side: HandleSide; offsetPercent?: number }> | undefined) ?? []

    const candidates = handles.filter((hd) => sideToHandleType(hd.side) === desiredHandleType)

    const preferredById = candidates.find((hd) => hd.id === (desiredHandleType === 'target' ? 'in' : 'out'))
    const preferredByCenter = candidates
      .slice()
      .sort((a, b) => Math.abs((a.offsetPercent ?? 50) - 50) - Math.abs((b.offsetPercent ?? 50) - 50))[0]
    const chosen = preferredById ?? preferredByCenter ?? null

    if (!chosen) {
      return {
        position: centerPosition(type, anchor),
        handleId: null as string | null,
      }
    }

    const pct = (chosen.offsetPercent ?? 50) / 100
    const anchorOffset =
      chosen.side === 'left'
        ? { x: 0, y: h * pct }
        : chosen.side === 'right'
          ? { x: w, y: h * pct }
          : chosen.side === 'top'
            ? { x: w * pct, y: 0 }
            : { x: w * pct, y: h }

    return {
      position: { x: anchor.x - anchorOffset.x, y: anchor.y - anchorOffset.y },
      handleId: chosen.id,
    }
  }, [centerPosition])

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
    sourceHandleType?: 'source' | 'target',
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
      const isFromTargetHandle = sourceHandleType === 'target'
      const ghostEdge: Edge = {
        id: GHOST_EDGE_ID,
        source: isFromTargetHandle ? GHOST_NODE_ID : sourceNodeId,
        sourceHandle: isFromTargetHandle ? 'right' : (sourceHandleId ?? null),
        target: isFromTargetHandle ? sourceNodeId : GHOST_NODE_ID,
        targetHandle: isFromTargetHandle ? (sourceHandleId ?? null) : 'left',
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
    sourceHandleType?: 'source' | 'target',
  ) => {
    setQuickAddMenu({ flowPos, sourceNodeId, sourceHandleId, sourceHandleType })
    if (sourceNodeId) placeGhost(flowPos, sourceNodeId, sourceHandleId, sourceHandleType)
  }, [setQuickAddMenu, placeGhost])

  const dismissQuickAdd = useCallback(() => {
    removeGhost()
    clearQuickAddMenu()
  }, [removeGhost, clearQuickAddMenu])

  const handleQuickAddSelect = useCallback((type: string, quickAddMenu: {
    flowPos: { x: number; y: number }
    sourceNodeId?: string
    sourceHandleId?: string
    sourceHandleType?: 'source' | 'target'
  } | null) => {
    if (!quickAddMenu) return
    const mod = MODULE_BY_ID[type]
    const id = `${type}-${Date.now()}`

    // Get source node info to determine parent container
    const sourceNode = quickAddMenu.sourceNodeId
      ? nodesRef.current.find((n) => n.id === quickAddMenu.sourceNodeId)
      : null

    // Calculate base position.
    // If this is quick-add from a handle, anchor the new node so its to-be-connected
    // handle sits at the exact drop/contact point.
    const desiredNewNodeHandleType: 'source' | 'target' | null = quickAddMenu.sourceNodeId
      ? (quickAddMenu.sourceHandleType === 'target' ? 'source' : 'target')
      : null
    const anchoredPlacement = desiredNewNodeHandleType
      ? getAnchoredNodePlacement(type, quickAddMenu.flowPos, desiredNewNodeHandleType)
      : null
    const pos = anchoredPlacement?.position ?? centerPosition(type, quickAddMenu.flowPos)

    removeGhost()

    if (type === "template" || type === "lasso") {
      setNodes((nds) => nds.map((n) => n.selected ? { ...n, selected: false } : n))
      clearQuickAddMenu()
      return
    }

    // Build node data - inherit templateId and instanceIdx from source if applicable
    const nodeData: Record<string, unknown> = { ...mod?.defaultData, type }

    // If source node is inside a template or is a template/instance child, inherit container info
    if (sourceNode) {
      // Case 1: Source is directly inside a template/lasso (has parentNode)
      if (sourceNode.parentNode) {
        nodeData.templateId = sourceNode.parentNode
        // If source has instanceIdx, inherit it (source is in an instance view)
        if (sourceNode.data?.instanceIdx !== undefined) {
          nodeData.instanceIdx = sourceNode.data.instanceIdx
        }
      }
      // Case 2: Source itself is a template/lasso node
      else if (sourceNode.data?.type === 'template' || sourceNode.data?.type === 'lasso') {
        // New node becomes a child of this container
        nodeData.templateId = sourceNode.id
      }
      // Case 3: Source has a templateId (it's a template child node)
      else if (sourceNode.data?.templateId) {
        nodeData.templateId = sourceNode.data.templateId
        if (sourceNode.data?.instanceIdx !== undefined) {
          nodeData.instanceIdx = sourceNode.data.instanceIdx
        }
      }
    }

    const newNode: Node = {
      id,
      type: type === "standard" ? "StandardNode" : "CustomNode",
      position: pos,
      data: nodeData as AnyNodeData,
    }

    // If the new node belongs to a container, add parentNode and extent
    if (nodeData.templateId) {
      const parentNode = nodesRef.current.find((n) => n.id === nodeData.templateId)
      if (parentNode) {
        newNode.parentNode = nodeData.templateId as string
        newNode.extent = "parent"
        // Adjust position to be relative to parent
        newNode.position = {
          x: pos.x - parentNode.position.x,
          y: pos.y - parentNode.position.y,
        }
      }
    }

    setNodes((nds) => nds.concat(newNode))

    if (quickAddMenu.sourceNodeId) {
      const isFromTargetHandle = quickAddMenu.sourceHandleType === 'target'
      const newNodeHandleId = anchoredPlacement?.handleId ?? null
      setEdges((es) => addEdge({
        source: isFromTargetHandle ? id : quickAddMenu.sourceNodeId!,
        sourceHandle: isFromTargetHandle ? newNodeHandleId : (quickAddMenu.sourceHandleId ?? null),
        target: isFromTargetHandle ? quickAddMenu.sourceNodeId! : id,
        targetHandle: isFromTargetHandle ? (quickAddMenu.sourceHandleId ?? null) : newNodeHandleId,
      }, es))
    }

    clearQuickAddMenu()

    // New nodes no longer auto-open editor; user can double-click to open.
  }, [centerPosition, removeGhost, nodesRef, setNodes, setEdges, clearQuickAddMenu, setEditorNodeId, getAnchoredNodePlacement])

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
            if (n.data?.templateId && idsToRemove.has(n.data.templateId)) {
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
        data: { ...mod?.defaultData, type: type as AnyNodeData['type'] },
      }))
      return
    }

    setPendingPos({ ...centeredPos, type })
    setDraftData({ ...mod?.defaultData, type: type as AnyNodeData['type'] })
  }, [centerPosition, setNodes, setPendingPos, setDraftData])

  const handleConfirmNode = useCallback((pendingPos: { x: number; y: number; type: string } | null, draftData: Partial<AnyNodeData>) => {
    if (!pendingPos) return
    const id = `${pendingPos.type}-${Date.now()}`
    setNodes((nds) => nds.concat({
      id,
      type: pendingPos.type === "standard" ? "StandardNode" : "CustomNode",
      position: { x: pendingPos.x, y: pendingPos.y },
      ...(pendingPos.type === "standard" ? { style: { width: 240, height: 120 } } : {}),
      ...(pendingPos.type === "image" && (draftData as Record<string, unknown>).width
        ? { style: { width: (draftData as Record<string, unknown>).width as number, height: (draftData as Record<string, unknown>).height as number } }
        : {}),
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
