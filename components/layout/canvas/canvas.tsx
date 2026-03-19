"use client"

import React, { useCallback, useEffect } from "react"
import { useSession } from "next-auth/react"
import ReactFlow, {
  Background,
  BackgroundVariant,
  Edge,
  Node,
  useReactFlow,
  useStore,
  ReactFlowProvider,
  OnMove,
  OnConnectStart,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  NodeChange,
  EdgeChange,
  ConnectionMode,
  Connection,
} from "reactflow"
import "reactflow/dist/style.css"

import { EditorModal } from "@/components/layout/std_node_modal"
import { NodeEditor } from "@/components/layout/node_editor/node_editor_index"
import { NodePickerMenu } from "@/components/layout/node_picker"
import CanvasToolbar from "@/components/layout/canvas/canvas-toolbar"

import { useAutosave } from "@/hooks/useAutosave"

import { nodeTypes, StandardNodeUI, CustomNodeUI, MODULE_BY_ID } from "@/components/layout/modules/_registry"
import { BatchOrchestratorContext } from "@/components/layout/modules/_polling"
import type { AnyNodeData, CustomNodeData } from "@/components/layout/modules/_types"

// ─────────────────────────────────────────────
// Custom Hooks
// ─────────────────────────────────────────────
import { useCanvasState } from "./hooks/useCanvasState"
import { useLoopManager } from "./hooks/useLoopManager"
import { useNodeOperations } from "./hooks/useNodeOperations"
import { useImportExport } from "./hooks/useImportExport"

// ─────────────────────────────────────────────
// Shared Components
// ─────────────────────────────────────────────
import { GhostCursor } from "./components/GhostCursor"

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface CanvasProps {
  activeTool: string | null
  onActiveTool: (tool: string | null) => void
  onBgClick?: () => void
  favorites: string[]
  onToggleFavorite: (typeId: string) => void
  onFavoritesImport: (favorites: string[]) => void
  importRef?: React.MutableRefObject<(() => void) | null>
  exportRef?: React.MutableRefObject<(() => void) | null>
  isSidebarOpen: boolean
  isRunning: boolean
  snapToGrid?: boolean
  onSnapToggle?: () => void
}

// ─────────────────────────────────────────────
// Shared constants
// ─────────────────────────────────────────────
const GHOST_NODE_ID = "__ghost_drop__"

// ─────────────────────────────────────────────
// CanvasLogic — must live inside ReactFlowProvider
// ─────────────────────────────────────────────
function CanvasLogic({
  activeTool,
  onActiveTool,
  onBgClick,
  favorites,
  onToggleFavorite,
  onFavoritesImport,
  importRef,
  exportRef,
  isSidebarOpen,
  isRunning,
  snapToGrid: propSnapToGrid,
  onSnapToggle: propOnSnapToggle,
}: CanvasProps) {
  const { screenToFlowPosition, fitView } = useReactFlow()
  const { data: session, status } = useSession()

  const transform = useStore((s) => s.transform)
  const [tx, ty, zoom] = transform

  // ── Custom hooks ──
  const canvasState = useCanvasState()
  const loopManager = useLoopManager(canvasState)
  const nodeOperations = useNodeOperations(canvasState)
  const importExport = useImportExport(canvasState)

  // ── Destructure state ──
  const {
    nodes,
    edges,
    pendingPos,
    draftData,
    editingNode,
    editorNodeId,
    snapToGrid: internalSnapToGrid,
    isDraftLoaded,
    quickAddMenu,
    mousePos,
    ghostZoom,
    setNodes,
    setEdges,
    setPendingPos,
    setDraftData,
    setEditingNode,
    setEditorNodeId,
    setSnapToGrid: setInternalSnapToGrid,
    setIsDraftLoaded,
    connectStartRef,
    connectionMadeRef,
    loopSelectionRef,
    fileInputRef,
    updateActiveToolRef,
    updateViewportRef,
    setMousePos,
  } = canvasState

  // ── Destructure loop manager ──
  const {
    handleLoopAddInstance,
    handleLoopSwitchView,
    handleLoopDeleteInstance,
    handleLoopRelease,
  } = loopManager

  // ── Destructure node operations ──
  const {
    openQuickAdd,
    dismissQuickAdd,
    handleQuickAddSelect: handleQuickAddSelectOp,
    handleNodeDoubleClick: handleNodeDoubleClickOp,
    handleNodeClick: handleNodeClickOp,
    handleEditUpdate: handleEditUpdateOp,
    handleDeleteNode: handleDeleteNodeOp,
    handleDeleteCustomNode,
    handleLassoRelease,
    handlePlacementRequest: handlePlacementRequestOp,
    handleConfirmNode: handleConfirmNodeOp,
  } = nodeOperations

  // ── Destructure import/export ──
  const {
    handleExportPack: handleExportPackOp,
    handleImportPack: handleImportPackOp,
  } = importExport

  // ── Sync activeTool to ref ──
  useEffect(() => {
    updateActiveToolRef(activeTool)
  }, [activeTool, updateActiveToolRef])

  // ── Ghost cursor mouse tracking (same as original canvas.tsx) ──
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY })
    if (activeTool) window.addEventListener("mousemove", onMouseMove)
    return () => window.removeEventListener("mousemove", onMouseMove)
  }, [activeTool, setMousePos])

  // ── Deselect all when container tool activated ──
  useEffect(() => {
    if (activeTool === "batch" || activeTool === "cycle") {
      setNodes((nds) => nds.map((n) => n.selected ? { ...n, selected: false } : n))
    }
  }, [activeTool, setNodes])

  // ── Sync isEditing flag on nodes ──
  useEffect(() => {
    setNodes((ns) => ns.map((n) => {
      const should = n.id === editorNodeId
      if (!!n.data.isEditing === should) return n
      return { ...n, data: { ...n.data, isEditing: should } }
    }))
  }, [editorNodeId, setNodes])

  // ── Load draft on mount, depends on session ──
  useEffect(() => {
    // Wait for session to load
    if (status === "loading") return

    // If not authenticated, don't load draft or enable autosave
    if (status === "unauthenticated") {
      console.log("[draft] Not authenticated, skipping draft load")
      setIsDraftLoaded(false)
      return
    }

    // status === "authenticated" - load draft from server
    fetch("/api/draft")
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 401) {
            console.warn("[draft] Unauthorized, cannot load draft")
            return { nodesJson: [], edgesJson: [] }
          }
          throw new Error(`HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((data) => {
        const savedNodes = data.nodesJson
        const savedEdges = data.edgesJson
        if (Array.isArray(savedNodes) && savedNodes.length > 0) {
          setNodes(savedNodes)
        }
        if (Array.isArray(savedEdges) && savedEdges.length > 0) {
          setEdges(savedEdges)
        }
      })
      .catch((err) => console.error("[draft] load failed:", err))
      .finally(() => setIsDraftLoaded(true))
  }, [status, setNodes, setEdges, setIsDraftLoaded])

  // ── Autosave (only when authenticated) ──
  useAutosave(nodes, edges, isDraftLoaded && status === "authenticated")

  // ─────────────────────────────────────────────
  // Batch — wraps selected nodes in a Batch container
  // ─────────────────────────────────────────────
  const commitBatch = useCallback((selectedNodes: Node[]) => {
    const PAD = 24, SEED_W = 180, SEED_H = 180, SEED_GAP = 32

    const selectedIds = new Set(selectedNodes.map(n => n.id))
    const topLevel = selectedNodes.filter(n =>
      n.id !== GHOST_NODE_ID &&
      !n.data?.isSeed &&
      (!n.parentNode || !selectedIds.has(n.parentNode))
    )
    if (topLevel.length === 0) return

    const getW = (n: Node) => (n.style?.width  as number | undefined) ?? n.data?.width  ?? 180
    const getH = (n: Node) => (n.style?.height as number | undefined) ?? n.data?.height ?? 180

    const minX = Math.min(...topLevel.map(n => n.position.x))
    const minY = Math.min(...topLevel.map(n => n.position.y))
    const maxX = Math.max(...topLevel.map(n => n.position.x + getW(n)))
    const maxY = Math.max(...topLevel.map(n => n.position.y + getH(n)))
    const encW = maxX - minX
    const encH = maxY - minY

    const batchId = `batch-${Date.now()}`
    const batchX  = minX - PAD - SEED_W - SEED_GAP
    const batchY  = minY - PAD
    const batchW  = PAD + SEED_W + SEED_GAP + encW + PAD
    const batchH  = Math.max(encH, SEED_H) + PAD * 2
    const seedY   = (batchH - SEED_H) / 2

    const batchNode: Node = {
      id:       batchId,
      type:     "BatchNode",
      position: { x: batchX, y: batchY },
      style:    { width: batchW, height: batchH },
      data:     { ...MODULE_BY_ID["batch"]?.defaultData, width: batchW, height: batchH, instanceCount: 0 },
      zIndex:   -1,
    }
    const seedNode: Node = {
      id:         `seed-${batchId}`,
      type:       "CustomNode",
      parentNode: batchId,
      extent:     "parent",
      position:   { x: PAD, y: seedY },
      data:       { type: "seed", label: "Seed", isSeed: true, isLocked: true, content: "", width: SEED_W, height: SEED_H },
      style:      { width: SEED_W, height: SEED_H },
      zIndex:     0,
    }

    const topLevelIds  = new Set(topLevel.map(n => n.id))
    const childOffsetX = PAD + SEED_W + SEED_GAP - minX
    const childOffsetY = PAD - minY

    setNodes((prev) => {
      const updated = prev.map(n => {
        if (!topLevelIds.has(n.id)) return { ...n, selected: false }
        return { ...n, selected: false, parentNode: batchId, extent: "parent" as const,
          position: { x: n.position.x + childOffsetX, y: n.position.y + childOffsetY } }
      })
      return [batchNode, seedNode, ...updated]
    })

    onActiveTool(null)
    loopSelectionRef.current = []
    setEditorNodeId(batchId)
  }, [setNodes, setEditorNodeId, onActiveTool, loopSelectionRef])

  // ─────────────────────────────────────────────
  // Cycle — wraps selected nodes in a Cycle container + auto-spawns a Gate
  // ─────────────────────────────────────────────
  const commitCycle = useCallback((selectedNodes: Node[]) => {
    // Use Gate module's default dimensions for consistency
    const GATE_W = MODULE_BY_ID["gate"]?.defaultData?.width  ?? 200
    const GATE_H = MODULE_BY_ID["gate"]?.defaultData?.height ?? 112
    const PAD = 24, GATE_GAP = 32

    const selectedIds = new Set(selectedNodes.map(n => n.id))
    const topLevel = selectedNodes.filter(n =>
      n.id !== GHOST_NODE_ID &&
      (!n.parentNode || !selectedIds.has(n.parentNode))
    )
    if (topLevel.length === 0) return

    const getW = (n: Node) => (n.style?.width  as number | undefined) ?? n.data?.width  ?? 180
    const getH = (n: Node) => (n.style?.height as number | undefined) ?? n.data?.height ?? 180

    const minX = Math.min(...topLevel.map(n => n.position.x))
    const minY = Math.min(...topLevel.map(n => n.position.y))
    const maxX = Math.max(...topLevel.map(n => n.position.x + getW(n)))
    const maxY = Math.max(...topLevel.map(n => n.position.y + getH(n)))
    const encW = maxX - minX
    const encH = maxY - minY

    const cycleId = `cycle-${Date.now()}`
    const cycleX  = minX - PAD
    const cycleY  = minY - PAD
    const cycleW  = encW + PAD * 2 + GATE_GAP + GATE_W + PAD
    const cycleH  = Math.max(encH, GATE_H) + PAD * 2

    const cycleNode: Node = {
      id:       cycleId,
      type:     "CycleNode",
      position: { x: cycleX, y: cycleY },
      style:    { width: cycleW, height: cycleH },
      data:     { ...MODULE_BY_ID["cycle"]?.defaultData, width: cycleW, height: cycleH, instanceCount: 0 },
      zIndex:   -1,
    }
    // Auto-spawned Gate — free, not locked (unlike Batch's Seed)
    const gateNode: Node = {
      id:         `gate-${cycleId}`,
      type:       "CustomNode",
      parentNode: cycleId,
      extent:     "parent",
      position:   { x: cycleW - PAD - GATE_W, y: (cycleH - GATE_H) / 2 },
      data:       { type: "gate", label: "Gate", width: GATE_W, height: GATE_H },
      style:      { width: GATE_W, height: GATE_H },
      zIndex:     0,
    }

    const topLevelIds  = new Set(topLevel.map(n => n.id))
    const childOffsetX = PAD - minX
    const childOffsetY = PAD - minY

    setNodes((prev) => {
      const updated = prev.map(n => {
        if (!topLevelIds.has(n.id)) return { ...n, selected: false }
        return { ...n, selected: false, parentNode: cycleId, extent: "parent" as const,
          position: { x: n.position.x + childOffsetX, y: n.position.y + childOffsetY } }
      })
      return [cycleNode, gateNode, ...updated]
    })

    onActiveTool(null)
    loopSelectionRef.current = []
    setEditorNodeId(cycleId)
  }, [setNodes, setEditorNodeId, onActiveTool, loopSelectionRef])

  // ─────────────────────────────────────────────
  // Quick-add
  // ─────────────────────────────────────────────
  const handleQuickAddSelect = useCallback((type: string) => {
    handleQuickAddSelectOp(type, quickAddMenu)
    // Container tool activation — activated here since the hook can't access onActiveTool
    if (quickAddMenu && (type === "batch" || type === "cycle")) {
      onActiveTool(type)
    }
  }, [handleQuickAddSelectOp, quickAddMenu, onActiveTool])

  // ─────────────────────────────────────────────
  // ReactFlow core handlers
  // ─────────────────────────────────────────────
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  )
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  )
  const handleConnect = useCallback((connection: Connection) => {
    connectionMadeRef.current = true
    setEdges((eds) => addEdge(connection, eds))
  }, [setEdges, connectionMadeRef])

  const handleMove: OnMove = useCallback((_event, viewport) => {
    updateViewportRef(viewport)
  }, [updateViewportRef])

  // ─────────────────────────────────────────────
  // Edge drag → empty drop → quick-add
  // ─────────────────────────────────────────────
  const handleConnectStart: OnConnectStart = useCallback((_event, { nodeId, handleId }) => {
    connectStartRef.current   = nodeId ? { nodeId, handleId } : null
    connectionMadeRef.current = false
  }, [connectStartRef, connectionMadeRef])

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    if (connectionMadeRef.current) {
      connectionMadeRef.current = false
      connectStartRef.current   = null
      return
    }

    const target = event.target as Element
    if (target?.closest?.(".react-flow__handle")) {
      connectStartRef.current = null
      return
    }

    const { clientX, clientY } =
      "touches" in event ? event.changedTouches[0] : (event as MouseEvent)

    const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
    openQuickAdd(flowPos, connectStartRef.current?.nodeId, connectStartRef.current?.handleId ?? undefined)
    connectStartRef.current = null
  }, [screenToFlowPosition, openQuickAdd, connectStartRef, connectionMadeRef])

  // ─────────────────────────────────────────────
  // Double-click on pane → quick-add
  // ─────────────────────────────────────────────
  const handleWrapperDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeTool === "batch" || activeTool === "cycle" || activeTool === "lasso") return
    if ((e.target as Element).closest(".react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap")) return
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    openQuickAdd(flowPos)
  }, [activeTool, screenToFlowPosition, openQuickAdd])

  // ─────────────────────────────────────────────
  // Pane click — place node with active tool
  // ─────────────────────────────────────────────
  const handlePlacementRequest = useCallback((type: string, position: { x: number; y: number }) => {
    handlePlacementRequestOp(type, position, onActiveTool)
  }, [handlePlacementRequestOp, onActiveTool])

  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    const nativeEvent = event.nativeEvent as MouseEvent & { touches?: TouchList }
    if (nativeEvent.touches && nativeEvent.touches.length > 1) return
    if (quickAddMenu) return
    if (activeTool === "batch" || activeTool === "cycle" || activeTool === "lasso") return

    setEditorNodeId(null)
    onBgClick?.()
    if (!activeTool) return

    const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const correctedPos = activeTool === "standard"
      ? { x: flowPos.x - 21, y: flowPos.y - 21 }
      : flowPos
    handlePlacementRequest(activeTool, correctedPos)
  }, [activeTool, screenToFlowPosition, onBgClick, handlePlacementRequest, quickAddMenu, setEditorNodeId])

  const handleConfirmNode = useCallback(() => {
    handleConfirmNodeOp(pendingPos, draftData)
  }, [handleConfirmNodeOp, pendingPos, draftData])

  // ─────────────────────────────────────────────
  // Node interactions
  // ─────────────────────────────────────────────
  const handleNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    handleNodeDoubleClickOp(event, node)
  }, [handleNodeDoubleClickOp])

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    handleNodeClickOp(event, node, editorNodeId)
  }, [handleNodeClickOp, editorNodeId])

  const handleEditUpdate = useCallback((data: Partial<AnyNodeData>) => {
    handleEditUpdateOp(data, editingNode)
  }, [handleEditUpdateOp, editingNode])

  const handleDeleteNode = useCallback(() => {
    handleDeleteNodeOp(editingNode)
  }, [handleDeleteNodeOp, editingNode])

  // ─────────────────────────────────────────────
  // Export / Import
  // ─────────────────────────────────────────────
  const handleExportPack = useCallback(async () => {
    handleExportPackOp(favorites)
  }, [handleExportPackOp, favorites])

  const handleImportPack = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    handleImportPackOp(file, onFavoritesImport, fitView)
  }, [handleImportPackOp, onFavoritesImport, fitView])

  // ── Register handlers into external refs ──
  useEffect(() => {
    if (importRef) importRef.current = () => fileInputRef.current?.click()
  }, [importRef, fileInputRef])

  useEffect(() => {
    if (exportRef) exportRef.current = () => handleExportPack()
  }, [exportRef, handleExportPack])

  // ─────────────────────────────────────────────
  // Lasso — wraps selected nodes in a Lasso container
  // ─────────────────────────────────────────────
  const commitLasso = useCallback((selectedNodes: Node[]) => {
    const PAD = 24

    const selectedIds = new Set(selectedNodes.map(n => n.id))
    const topLevel = selectedNodes.filter(n =>
      n.id !== GHOST_NODE_ID &&
      (!n.parentNode || !selectedIds.has(n.parentNode))
    )
    if (topLevel.length === 0) return

    const getW = (n: Node) => (n.style?.width  as number | undefined) ?? n.data?.width  ?? 180
    const getH = (n: Node) => (n.style?.height as number | undefined) ?? n.data?.height ?? 180

    const minX = Math.min(...topLevel.map(n => n.position.x))
    const minY = Math.min(...topLevel.map(n => n.position.y))
    const maxX = Math.max(...topLevel.map(n => n.position.x + getW(n)))
    const maxY = Math.max(...topLevel.map(n => n.position.y + getH(n)))
    const encW = maxX - minX
    const encH = maxY - minY

    const lassoId = `lasso-${Date.now()}`
    const lassoX  = minX - PAD
    const lassoY  = minY - PAD
    const lassoW  = encW + PAD * 2
    const lassoH  = encH + PAD * 2

    const lassoNode: Node = {
      id:       lassoId,
      type:     "LassoNode",
      position: { x: lassoX, y: lassoY },
      style:    { width: lassoW, height: lassoH },
      data:     { ...MODULE_BY_ID["lasso"]?.defaultData, width: lassoW, height: lassoH, instanceCount: 0 },
      zIndex:   -1,
    }

    const topLevelIds  = new Set(topLevel.map(n => n.id))
    const childOffsetX = PAD - minX
    const childOffsetY = PAD - minY

    setNodes((prev) => {
      const updated = prev.map(n => {
        if (!topLevelIds.has(n.id)) return { ...n, selected: false }
        return { ...n, selected: false, parentNode: lassoId, extent: "parent" as const,
          position: { x: n.position.x + childOffsetX, y: n.position.y + childOffsetY } }
      })
      return [lassoNode, ...updated]
    })

    onActiveTool(null)
    loopSelectionRef.current = []
    setEditorNodeId(lassoId)
  }, [setNodes, setEditorNodeId, onActiveTool, loopSelectionRef])

  const handleContainerSelectionChange = useCallback(({ nodes: selected }: { nodes: Node[]; edges: Edge[] }) => {
    if (activeTool === "batch" || activeTool === "cycle" || activeTool === "lasso") loopSelectionRef.current = selected
  }, [activeTool, loopSelectionRef])

  const handleContainerMouseDown = useCallback((_e: React.MouseEvent) => {
    if (activeTool !== "batch" && activeTool !== "cycle" && activeTool !== "lasso") return
    loopSelectionRef.current = []
  }, [activeTool, loopSelectionRef])

  const handleContainerMouseUp = useCallback(() => {
    if (activeTool === "batch")      commitBatch(loopSelectionRef.current)
    else if (activeTool === "cycle") commitCycle(loopSelectionRef.current)
    else if (activeTool === "lasso") commitLasso(loopSelectionRef.current)
  }, [activeTool, commitBatch, commitCycle, commitLasso, loopSelectionRef])

  // ── Escape cancels container selection tool ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (activeTool === "batch" || activeTool === "cycle" || activeTool === "lasso")) onActiveTool(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeTool, onActiveTool])

  // ─────────────────────────────────────────────
  // Menu screen position
  // ─────────────────────────────────────────────
  const menuLeft = quickAddMenu ? quickAddMenu.flowPos.x * zoom + tx + 14 : 0
  const menuTop  = quickAddMenu ? quickAddMenu.flowPos.y * zoom + ty - 20 : 0

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <BatchOrchestratorContext.Provider value={{ addInstance: handleLoopAddInstance }}>
    <div
      className="w-full h-full relative"
      style={{
        touchAction: "none",
        cursor: (activeTool === "batch" || activeTool === "cycle" || activeTool === "lasso") ? "crosshair" : undefined,
      }}
      onDoubleClick={handleWrapperDoubleClick}
      onMouseDown={handleContainerMouseDown}
      onMouseUp={handleContainerMouseUp}
    >
      <style>{`
        .react-flow__node, .react-flow__node-default {
          background: none; border: none;
          padding: 0; border-radius: 0; box-shadow: none;
          will-change: auto !important;
        }
        .react-flow__node:focus,
        .react-flow__node-default:focus { outline: none; }
        .react-flow__renderer, .react-flow__pane { touch-action: none; }
        .react-flow__selection {
          background: rgba(99,102,241,0.05) !important;
          border: 2px dashed rgba(99,102,241,0.55) !important;
          border-radius: 12px !important;
        }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onPaneClick={handlePaneClick}
        onMove={handleMove}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeClick={handleNodeClick}
        onSelectionChange={handleContainerSelectionChange}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={10}
        defaultEdgeOptions={{ type: "default", style: { stroke: "#94a3b8", strokeWidth: 1.5 } }}
        panOnDrag={activeTool !== "batch" && activeTool !== "cycle" && activeTool !== "lasso"}
        selectionOnDrag={activeTool === "batch" || activeTool === "cycle" || activeTool === "lasso"}
        zoomOnPinch={true}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        panOnScroll={true}
        preventScrolling={true}
        snapToGrid={propSnapToGrid ?? internalSnapToGrid}
        snapGrid={[16, 16]}
      >
        <Background color="#94a3b8" gap={40} variant={BackgroundVariant.Dots} />
        <CanvasToolbar
          isSidebarOpen={isSidebarOpen}
          isRunning={isRunning}
          snapToGrid={propSnapToGrid ?? internalSnapToGrid}
          onSnapToggle={propOnSnapToggle ?? (() => setInternalSnapToGrid(v => !v))}
        />
      </ReactFlow>

      {/* Quick-add picker */}
      {quickAddMenu && (
        <NodePickerMenu
          closeMode="outside"
          onSelect={handleQuickAddSelect}
          onDismiss={dismissQuickAdd}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          showArrow={!!quickAddMenu.sourceNodeId}
          left={menuLeft}
          top={menuTop}
        />
      )}

      {/* Inline node editor */}
      {editorNodeId && (
        <NodeEditor
          nodeId={editorNodeId}
          onClose={() => setEditorNodeId(null)}
          onDelete={handleDeleteCustomNode}
          onLoopAddInstance={handleLoopAddInstance}
          onLoopDeleteInstance={handleLoopDeleteInstance}
          onLoopSwitchView={handleLoopSwitchView}
          onLoopRelease={handleLoopRelease}
          onLassoRelease={handleLassoRelease}
        />
      )}

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.formula"
        className="hidden"
        onChange={handleImportPack}
      />

      {/* Placement modal (StandardNode only) */}
      <EditorModal
        isOpen={!!pendingPos}
        onClose={() => { setPendingPos(null); setDraftData({}) }}
        element={pendingPos ? {
          id: "temp_ghost",
          type: pendingPos.type === "standard" ? "StandardNode" : "CustomNode",
          data: draftData as AnyNodeData,
          position: { x: pendingPos.x, y: pendingPos.y },
        } as Node<AnyNodeData> : undefined}
        onUpdate={(data) => setDraftData((prev) => ({ ...prev, ...data }))}
        onConfirm={handleConfirmNode}
      />

      {/* Edit modal (StandardNode only) */}
      <EditorModal
        isOpen={!!editingNode}
        onClose={() => setEditingNode(null)}
        element={editingNode ?? undefined}
        onUpdate={handleEditUpdate}
        onConfirm={() => setEditingNode(null)}
        onDelete={handleDeleteNode}
      />

      {/* Ghost cursor for active tool */}
      <GhostCursor
        activeTool={activeTool}
        mousePos={mousePos}
        ghostZoom={ghostZoom}
      />
    </div>
    </BatchOrchestratorContext.Provider>
  )
}

export default function Canvas(props: CanvasProps) {
  return (
    <div className="absolute inset-0 z-0">
      <ReactFlowProvider>
        <CanvasLogic {...props} />
      </ReactFlowProvider>
    </div>
  )
}