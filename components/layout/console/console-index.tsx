"use client"

/**
 * ConsoleIndex — WorkflowEngine-powered execution console.
 *
 * Architecture (Phase 2):
 *  1. On open → collect all canvas nodes/edges
 *  2. POST /api/execute/workflow → get workflowJobId
 *  3. Subscribe to SSE stream (GET /api/execute/workflow/[id]/stream)
 *  4. SSE pushes WorkflowJob status updates → drive task list + fitView
 *  5. pause/resume/stop via PATCH /api/execute/workflow/[id]
 *  6. Manual nodes: detect 'waiting_manual' → show ConsoleNodePanel
 *     → user acts → POST /api/execute/workflow/[id]/nodes/[nodeId]/complete
 */

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useReactFlow, useNodes } from "reactflow"
import { cn } from "@/lib/utils"
import { ChevronsLeft, ChevronsRight, Play, Pause, Square } from "lucide-react"
import { estimateNodeCost, estimateWorkflowBudget } from "@/lib/credits"

import type { CustomNodeData } from "../modules/_types"
import type { ConsolePhase, ConsoleTask } from "./console-types"
import { ConsoleHeader } from "./console-header"
import { ConsoleTaskItem } from "./console-task-item"
import { ConsoleNodePanel } from "./console-node-panel"

// ─────────────────────────────────────────────
// Executable node types (same as workflow engine)
// ─────────────────────────────────────────────
const EXECUTABLE_TYPES = new Set(["text", "image", "video", "pdf", "filter", "template", "standard"])

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface ConsoleIndexProps {
  isVisible: boolean
  onStop: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  collapsedContentRef?: React.RefObject<HTMLDivElement | null>
}

// ─────────────────────────────────────────────
// WorkflowStatus shape from SSE
// ─────────────────────────────────────────────
interface WorkflowStatus {
  id: string
  status: string
  totalNodes: number
  completedCount: number
  failedCount: number
  nodeStatuses?: Record<string, {
    nodeId: string
    nodeType?: string
    status?: string
    jobId?: string
    error?: string | null
  }>
}

// ─────────────────────────────────────────────
// Map WorkflowJob status → ConsolePhase
// ─────────────────────────────────────────────
function wfStatusToPhase(wfStatus: string): ConsolePhase {
  if (wfStatus === "completed") return "complete"
  if (wfStatus === "failed")    return "error"
  if (wfStatus === "stopped")   return "stopped"
  if (wfStatus === "paused")    return "paused"
  if (wfStatus === "running")   return "running"
  return "running"
}

// ─────────────────────────────────────────────
// Map WorkflowGateStatus → TaskStatus
// ─────────────────────────────────────────────
function nodeStatusToTask(status: string): ConsoleTask["status"] {
  if (status === "done")           return "done"
  if (status === "failed")         return "error"
  if (status === "waiting_manual") return "waiting_manual"
  if (status === "running" || status === "queueing_job" || status === "pending") return "running"
  return "pending"
}

// ─────────────────────────────────────────────
// Console Component
// ─────────────────────────────────────────────
export default function ConsoleIndex({
  isVisible,
  onStop,
  isCollapsed = false,
  onToggleCollapse,
  collapsedContentRef,
}: ConsoleIndexProps) {
  const { setNodes, getNodes, getEdges, setViewport } = useReactFlow()
  useNodes()

  // ── State ──
  const [phase, setPhase] = useState<ConsolePhase>("ready")
  const [tasks, setTasks] = useState<ConsoleTask[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [scrollToId, setScrollToId] = useState<string | null>(null)
  const [budgetMin, setBudgetMin] = useState(0)
  const [budgetMax, setBudgetMax] = useState(0)
  const [isBudgetRange, setIsBudgetRange] = useState(false)

  // ── Refs ──
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const workflowJobIdRef = useRef<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const tasksRef = useRef(tasks)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const wasVisibleRef = useRef(false)
  // Track previous running node IDs to only fitView on changes
  const prevRunningIdsRef = useRef<string>("")

  const fitNodesInVisibleCanvas = useCallback(({
    nodeIds,
    duration = 600,
    padding = 0.15,
    maxZoom = 1.5,
  }: {
    nodeIds?: string[]
    duration?: number
    // Horizontal padding ratio in the visible (non-console) canvas area.
    // Vertical fitting uses full viewport height (no vertical padding).
    padding?: number
    maxZoom?: number
  } = {}) => {
    const all = getNodes().filter((n) => !n.hidden)
    if (all.length === 0) return

    const target = nodeIds && nodeIds.length > 0
      ? all.filter((n) => nodeIds.includes(n.id))
      : all
    if (target.length === 0) return

    const nodeMap = new Map(all.map((n) => [n.id, n]))
    const absCache = new Map<string, { x: number; y: number }>()
    const getAbsPos = (node: typeof all[number]): { x: number; y: number } => {
      const cached = absCache.get(node.id)
      if (cached) return cached
      if (!node.parentNode) {
        const p = { x: node.position.x, y: node.position.y }
        absCache.set(node.id, p)
        return p
      }
      const parent = nodeMap.get(node.parentNode)
      if (!parent) {
        const p = { x: node.position.x, y: node.position.y }
        absCache.set(node.id, p)
        return p
      }
      const pp = getAbsPos(parent)
      const p = { x: pp.x + node.position.x, y: pp.y + node.position.y }
      absCache.set(node.id, p)
      return p
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of target) {
      const w = n.width ?? ((n.data as Record<string, unknown> | undefined)?.width as number | undefined) ?? 180
      const h = n.height ?? ((n.data as Record<string, unknown> | undefined)?.height as number | undefined) ?? 180
      const p = getAbsPos(n)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + w)
      maxY = Math.max(maxY, p.y + h)
    }

    const boundsW = Math.max(1, maxX - minX)
    const boundsH = Math.max(1, maxY - minY)
    const rect = rootRef.current?.getBoundingClientRect()
    const visibleX = Math.max(0, (rect?.right ?? 0) + 12)
    const visibleW = Math.max(120, window.innerWidth - visibleX - 12)
    const visibleH = window.innerHeight

    // Apply padding only on horizontal fitting so console-side occlusion is avoided.
    // Vertical fitting should use full viewport height.
    const zoomX = (visibleW * (1 - 2 * padding)) / boundsW
    const zoomY = visibleH / boundsH
    const zoom = Math.min(zoomX, zoomY, maxZoom)
    const clampedZoom = Math.max(0.1, Math.min(maxZoom, zoom))
    const flowCX = minX + boundsW / 2
    const flowCY = minY + boundsH / 2
    const screenCX = visibleX + visibleW / 2
    const screenCY = visibleH / 2 - 32

    setViewport(
      { x: screenCX - flowCX * clampedZoom, y: screenCY - flowCY * clampedZoom + 16, zoom: clampedZoom },
      { duration },
    )
  }, [getNodes, setViewport])

  const resetConsoleNodeStates = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => {
        const d = n.data as CustomNodeData
        if (d.mode === "note") return { ...n, data: { ...n.data, done: true } }
        return {
          ...n,
          data: {
            ...n.data,
            done: false,
            isGenerating: false,
            generationProgress: 0,
            generationStatusText: "",
            generationError: undefined,
            activeJobId: undefined,
          },
        }
      }),
    )
  }, [setNodes])

  // Keep tasksRef in sync
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  // ─────────────────────────────────────────────
  // SSE management
  // ─────────────────────────────────────────────
  const closeSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  // ─────────────────────────────────────────────
  // Build initial task list from canvas nodes
  // (topological order, for display only — execution is backend DAG)
  // ─────────────────────────────────────────────
  const buildInitialTasks = useCallback(() => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()

    const execNodes = currentNodes.filter((n) => {
      const type = (n.data as CustomNodeData)?.type
      if (!type || !EXECUTABLE_TYPES.has(type)) return false
      // Template child nodes are executed by template workflows, not top-level console workflow.
      if ((n.data as CustomNodeData)?.templateId) return false
      return true
    })
    if (execNodes.length === 0) return []

    const nodeIds = new Set(execNodes.map((n) => n.id))
    const adjacency = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    for (const n of execNodes) {
      adjacency.set(n.id, [])
      inDegree.set(n.id, 0)
    }

    for (const e of currentEdges) {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
      adjacency.get(e.source)!.push(e.target)
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
    }

    // Kahn's algorithm
    const tasks: ConsoleTask[] = []
    let queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)
    let batchIndex = 0

    while (queue.length > 0) {
      const nextQueue: string[] = []
      for (const nodeId of queue) {
        const node = execNodes.find((n) => n.id === nodeId)!
        const data = node.data as CustomNodeData
        const rawMode = data.mode as string | undefined
        const mode = (rawMode === "done" ? "note" : rawMode) as "auto" | "manual" | "note" | undefined

        tasks.push({
          nodeId,
          label: data.label || data.type || nodeId.slice(-6),
          type: data.type || "text",
          estimatedCost: estimateNodeCost({ id: node.id, type: node.type, data: node.data as Record<string, unknown> }),
          mode: mode || "auto",
          done: data.done === true || data.mode === "note",
          hasPrompt: !!(data.prompt?.trim()),
          status: "pending",
          batchIndex,
        })

        for (const neighbor of adjacency.get(nodeId) || []) {
          const newDeg = (inDegree.get(neighbor) || 0) - 1
          inDegree.set(neighbor, newDeg)
          if (newDeg === 0) nextQueue.push(neighbor)
        }
      }
      queue = nextQueue
      batchIndex++
    }

    return tasks
  }, [getNodes, getEdges])

  // ── Build task list and fitView when console opens ──
  useEffect(() => {
    if (!isVisible) return
    const plan = buildInitialTasks()
    setTasks(plan)

    const currentNodes = getNodes()
    const execNodes = currentNodes.filter((n) => {
      const type = (n.data as CustomNodeData)?.type
      if (!type || !EXECUTABLE_TYPES.has(type)) return false
      if ((n.data as CustomNodeData)?.templateId) return false
      return true
    })
    const budget = estimateWorkflowBudget(
      execNodes.map((n) => ({ id: n.id, type: n.type, data: n.data as Record<string, unknown> })),
      currentNodes.map((n) => ({ id: n.id, type: n.type, data: n.data as Record<string, unknown> })),
    )
    setBudgetMin(budget.min)
    setBudgetMax(budget.max)
    setIsBudgetRange(budget.isRange)

    setPhase("ready")
    setElapsed(0)
    setExpandedTaskId(null)
    prevRunningIdsRef.current = ""

    // Fit all nodes on open
    requestAnimationFrame(() => {
      fitNodesInVisibleCanvas({ duration: 600, padding: 0.15, maxZoom: 1.5 })
    })

    // Deselect all nodes, close editors
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        selected: false,
        data: { ...n.data, isEditing: false },
      })),
    )

    // Dispatch canvas lock
    window.dispatchEvent(new CustomEvent("console:lock-canvas"))
  }, [isVisible]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on close ──
  useEffect(() => {
    if (isVisible) {
      wasVisibleRef.current = true
      return
    }
    if (!wasVisibleRef.current) return
    wasVisibleRef.current = false
    const jobId = workflowJobIdRef.current
    if (jobId && phase !== "ready") {
      fetch(`/api/execute/workflow/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      }).catch(console.error)
    }
    closeSSE()
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
      elapsedRef.current = null
    }
    workflowJobIdRef.current = null
    resetConsoleNodeStates()
    window.dispatchEvent(new CustomEvent("console:unlock-canvas"))
  }, [isVisible, phase, closeSSE, resetConsoleNodeStates])

  // ── Elapsed timer ──
  const startElapsedTimer = useCallback(() => {
    if (elapsedRef.current) clearInterval(elapsedRef.current)
    startTimeRef.current = Date.now()
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
  }, [])

  const stopElapsedTimer = useCallback(() => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
      elapsedRef.current = null
    }
  }, [])

  // ── Scroll to task ──
  useEffect(() => {
    if (!scrollToId || !scrollContainerRef.current) return
    const el = scrollContainerRef.current.querySelector(`[data-task-id="${scrollToId}"]`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
    setScrollToId(null)
  }, [scrollToId])

  // ─────────────────────────────────────────────
  // Fit view to nodes currently running (showing progress bar)
  // ─────────────────────────────────────────────
  const fitToRunningNodes = useCallback(
    (nodeStatuses: Record<string, { status?: string }>) => {
      const runningIds = Object.entries(nodeStatuses)
        .filter(([, s]) => {
          const st = s?.status ?? ""
          return st === "running" || st === "queueing_job" || st === "pending" || st === "waiting_manual"
        })
        .map(([id]) => id)

      if (runningIds.length === 0) return

      const key = runningIds.sort().join(",")
      if (key === prevRunningIdsRef.current) return // no change
      prevRunningIdsRef.current = key

      fitNodesInVisibleCanvas({ nodeIds: runningIds, duration: 500, padding: 0.3, maxZoom: 1.5 })
    },
    [fitNodesInVisibleCanvas],
  )

  // ─────────────────────────────────────────────
  // Update node UI state based on WorkflowEngine nodeStatuses
  // ─────────────────────────────────────────────
  const applyNodeStatuses = useCallback(
    (nodeStatuses: Record<string, {
      status?: string
      jobId?: string
      error?: string | null
    }>) => {
      setNodes((ns) => ns.map((n) => {
        const s = nodeStatuses[n.id]
        if (!s) return n

        const status = s.status ?? "queueing_in_workflow"
        const jobId = s.jobId
        const nextData: Record<string, unknown> = { ...n.data }

        if (status === "done") {
          if (typeof jobId === "string" && jobId.length > 0) nextData.activeJobId = jobId
          return { ...n, data: nextData }
        }

        if (status === "failed") {
          nextData.isGenerating = false
          nextData.generationProgress = 0
          nextData.generationStatusText = ""
          nextData.activeJobId = undefined
          nextData.done = false
          nextData.generationError = s.error ?? "Generation failed"
          return { ...n, data: nextData }
        }

        if (status === "waiting_manual") {
          nextData.isGenerating = false
          nextData.generationProgress = 0
          nextData.generationStatusText = "Waiting for input…"
          nextData.activeJobId = undefined
          return { ...n, data: nextData }
        }

        if (status === "paused") {
          nextData.isGenerating = true
          nextData.generationStatusText = "Paused…"
          return { ...n, data: nextData }
        }

        if (status === "queueing_in_workflow" || status === "waiting_upstream") {
          nextData.isGenerating = true
          nextData.generationProgress = 0
          nextData.generationStatusText =
            status === "waiting_upstream" ? "Waiting for upstream…" : "Queueing in workflow…"
          nextData.activeJobId = undefined
          if (nextData.done !== true) nextData.done = false
          return { ...n, data: nextData }
        }

        if (status === "queueing_job" || status === "pending" || status === "running") {
          nextData.isGenerating = true
          if (typeof jobId === "string" && jobId.length > 0) {
            nextData.activeJobId = jobId
            if (typeof nextData.generationStatusText !== "string" || nextData.generationStatusText.length === 0) {
              nextData.generationStatusText = status === "running" ? "Running job…" : "Queueing job…"
            }
          } else {
            nextData.generationStatusText = status === "running" ? "Running job…" : "Queueing job…"
          }
          if (nextData.done !== true) nextData.done = false
          return { ...n, data: nextData }
        }

        return n
      }))
    },
    [setNodes],
  )

  // ─────────────────────────────────────────────
  // Handle SSE WorkflowStatus update
  // ─────────────────────────────────────────────
  const handleWorkflowUpdate = useCallback(
    (status: WorkflowStatus) => {
      const nodeStatuses = status.nodeStatuses ?? {}

      // Apply node UI state
      applyNodeStatuses(nodeStatuses)

      // fitView to running nodes
      fitToRunningNodes(nodeStatuses)

      // Update task list
      setTasks((prev) =>
        prev.map((task) => {
          const ns = nodeStatuses[task.nodeId]
          if (!ns) return task
          const newStatus = nodeStatusToTask(ns.status ?? "queueing_in_workflow")
          if (newStatus === task.status && ns.jobId === task.jobId) return task
          return {
            ...task,
            status: newStatus,
            jobId: ns.jobId,
            error: ns.error ?? undefined,
            done: newStatus === "done",
            startedAt: newStatus === "running" && !task.startedAt ? Date.now() : task.startedAt,
            duration: newStatus === "done" && task.startedAt ? Date.now() - task.startedAt : task.duration,
          }
        }),
      )

      // Update console phase
      const newPhase = wfStatusToPhase(status.status)
      setPhase(newPhase)

      // Running range behavior:
      // If there are template nodes not finished yet, remaining budget stays range/unknown.
      const hasUnresolvedTemplate =
        tasksRef.current.some((t) => t.type === "template" && t.status !== "done" && t.status !== "error") ||
        Object.values(nodeStatuses).some(
          (s) => s.nodeType === "template" && s.status !== "done" && s.status !== "failed",
        )
      setIsBudgetRange(hasUnresolvedTemplate)

      // Check for manual nodes waiting
      const manualWaiting = Object.entries(nodeStatuses)
        .filter(([, s]) => s?.status === "waiting_manual")
        .map(([id]) => id)

      if (manualWaiting.length > 0 && newPhase === "running") {
        setPhase("paused_manual")
        const firstManual = manualWaiting[0]
        setExpandedTaskId(firstManual)
        setScrollToId(firstManual)
        fitNodesInVisibleCanvas({ nodeIds: manualWaiting, duration: 500, padding: 0.3, maxZoom: 1.5 })
      }

      // Terminal states
      if (status.status === "completed" || status.status === "failed" || status.status === "stopped") {
        stopElapsedTimer()
        closeSSE()
        if (status.status === "completed") {
          setTimeout(() => {
            fitNodesInVisibleCanvas({ duration: 800, padding: 0.15, maxZoom: 1.5 })
          }, 300)
        }
      }
    },
    [applyNodeStatuses, fitToRunningNodes, fitNodesInVisibleCanvas, stopElapsedTimer, closeSSE],
  )

  const startSSE = useCallback(
    (workflowJobId: string) => {
      closeSSE()
      const es = new EventSource(`/api/execute/workflow/${workflowJobId}/stream`)
      eventSourceRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WorkflowStatus
          handleWorkflowUpdate(data)
        } catch {
          // ignore parse errors
        }
      }

      es.onerror = () => {
        console.error("[console] SSE stream error")
        es.close()
      }
    },
    [closeSSE, handleWorkflowUpdate],
  )

  // ─────────────────────────────────────────────
  // Play / Start execution
  // ─────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (phase === "paused") {
      // Resume
      const jobId = workflowJobIdRef.current
      if (!jobId) return
      await fetch(`/api/execute/workflow/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      })
      setPhase("running")
      startSSE(jobId)
      return
    }

    if (phase !== "ready") return

    // Start new execution
    const currentNodes = getNodes()
    const currentEdges = getEdges()

    // Filter executable nodes
    const executableTypes = ["text", "image", "video", "pdf", "filter", "template", "standard"]
    const executableNodes = currentNodes.filter(
      (n) => {
        const d = n.data as CustomNodeData
        if (!executableTypes.includes(d?.type ?? "")) return false
        if (d?.templateId) return false
        return true
      }
    )

    if (executableNodes.length === 0) return

    // Signal all nodes as queued
    const executableIds = new Set(executableNodes.map((n) => n.id))
    setNodes((ns) =>
      ns.map((n) => {
        if (!executableIds.has(n.id)) return n
        const isNote = (n.data as CustomNodeData)?.mode === "note"
        return {
          ...n,
          data: {
            ...n.data,
            isGenerating: !isNote,
            activeJobId: undefined,
            generationProgress: 0,
            generationStatusText: isNote ? undefined : "Queueing in workflow…",
            generationError: undefined,
            done: isNote ? n.data?.done : false,
          },
        }
      }),
    )

    startElapsedTimer()
    setPhase("running")

    try {
      const workflowNodes = executableNodes.map((n) => ({
        id: n.id,
        type: n.type ?? "text",
        data: n.data ?? {},
      }))

      const workflowEdges = currentEdges
        .filter((e) => executableIds.has(e.source) && executableIds.has(e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          ...(e.targetHandle && { targetHandle: e.targetHandle }),
        }))

      const res = await fetch("/api/execute/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lassoNodeId: "console",
          nodes: workflowNodes,
          edges: workflowEdges,
        }),
      })

      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? "Workflow start failed")

      const { workflowJobId } = json as { workflowJobId: string }
      workflowJobIdRef.current = workflowJobId
      startSSE(workflowJobId)
    } catch (err) {
      console.error("[console] Failed to start workflow:", err)
      setPhase("error")
      stopElapsedTimer()
      // Restore node states
      setNodes((ns) =>
        ns.map((n) => {
          if (!executableIds.has(n.id)) return n
          return { ...n, data: { ...n.data, isGenerating: false, generationStatusText: "", done: false } }
        }),
      )
    }
  }, [phase, getNodes, getEdges, setNodes, startElapsedTimer, stopElapsedTimer, startSSE])

  // ─────────────────────────────────────────────
  // Pause
  // ─────────────────────────────────────────────
  const handlePause = useCallback(async () => {
    const jobId = workflowJobIdRef.current
    if (!jobId || phase !== "running") return
    await fetch(`/api/execute/workflow/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    })
    setPhase("paused")
    // Keep SSE open to track remaining running nodes finishing
  }, [phase])

  // ─────────────────────────────────────────────
  // Stop / Exit
  // ─────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    const jobId = workflowJobIdRef.current
    if (jobId && phase !== "ready") {
      await fetch(`/api/execute/workflow/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      }).catch(console.error)
    }

    closeSSE()
    stopElapsedTimer()
    workflowJobIdRef.current = null

    // Restore all non-note nodes
    resetConsoleNodeStates()

    window.dispatchEvent(new CustomEvent("console:unlock-canvas"))
    onStop()
  }, [phase, closeSSE, stopElapsedTimer, resetConsoleNodeStates, onStop])

  // ─────────────────────────────────────────────
  // Manual node: generate
  // ─────────────────────────────────────────────
  const handleManualGenerate = useCallback(
    async (nodeId: string) => {
      const jobId = workflowJobIdRef.current
      if (!jobId) return

      const node = getNodes().find((n) => n.id === nodeId)
      if (!node) return

      const data = node.data as CustomNodeData

      // Update task status
      setTasks((prev) =>
        prev.map((t) =>
          t.nodeId === nodeId ? { ...t, status: "running", startedAt: Date.now() } : t,
        ),
      )

      // Create and execute a job for this manual node
      setNodes((ns) =>
        ns.map((n) =>
          n.id !== nodeId
            ? n
            : {
                ...n,
                data: {
                  ...n.data,
                  isGenerating: true,
                  generationProgress: 0,
                  generationStatusText: "Queueing job…",
                  generationError: undefined,
                },
              },
        ),
      )

      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId,
            nodeType: data.type ?? "text",
            prompt: data.prompt,
            model: data.model,
            modelParams: data.params,
          }),
        })
        const json = await res.json()
        if (!res.ok || json.error) throw new Error(json.error ?? "Job creation failed")

        const { jobId: newJobId } = json as { jobId: string }
        setNodes((ns) =>
          ns.map((n) => (n.id !== nodeId ? n : { ...n, data: { ...n.data, activeJobId: newJobId } })),
        )

        // Signal workflow engine to continue (manual complete with empty result for now)
        // The job polling will write content to node.data.content via resultHandler
        await fetch(`/api/execute/workflow/${jobId}/nodes/${nodeId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", result: { content: data.content ?? "" } }),
        })

        setExpandedTaskId(null)
        setPhase("running")
        // Resume SSE stream if not already active
        startSSE(jobId)
      } catch (err) {
        console.error("[console] manual generate failed:", err)
        const msg = err instanceof Error ? err.message : "Generation failed"
        setTasks((prev) =>
          prev.map((t) => (t.nodeId === nodeId ? { ...t, status: "error", error: msg } : t)),
        )
      }
    },
    [getNodes, setNodes, startSSE],
  )

  // ─────────────────────────────────────────────
  // Manual node: continue without generating
  // ─────────────────────────────────────────────
  const handleManualContinue = useCallback(
    async (nodeId: string) => {
      const jobId = workflowJobIdRef.current
      if (!jobId) return

      setTasks((prev) =>
        prev.map((t) => (t.nodeId === nodeId ? { ...t, status: "done", done: true } : t)),
      )
      setNodes((ns) =>
        ns.map((n) => (n.id !== nodeId ? n : { ...n, data: { ...n.data, done: true } })),
      )

      await fetch(`/api/execute/workflow/${jobId}/nodes/${nodeId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      }).catch(console.error)

      setExpandedTaskId(null)
      setPhase("running")
      startSSE(jobId)
    },
    [setNodes, startSSE],
  )

  // ─────────────────────────────────────────────
  // Task click
  // ─────────────────────────────────────────────
  const handleTaskClick = useCallback(
    (task: ConsoleTask) => {
      if (expandedTaskId === task.nodeId) {
        setExpandedTaskId(null)
      } else {
        setExpandedTaskId(task.nodeId)
        fitNodesInVisibleCanvas({ nodeIds: [task.nodeId], duration: 500, padding: 0.3, maxZoom: 1.5 })
      }
    },
    [expandedTaskId, fitNodesInVisibleCanvas],
  )

  // ── Derived state ──
  const doneCount = tasks.filter((t) => t.status === "done" || t.status === "skipped").length
  const spentCredits = tasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + (t.estimatedCost || 0), 0)
  const isRunning = phase === "running"
  const isPaused = phase === "paused"
  const isReady = phase === "ready"
  const showPlayButton = isReady || isPaused
  const showPauseButton = isRunning
  const activeTask = tasks.find((t) => t.status === "running" || t.status === "waiting_manual" || t.status === "pending")
  const activeTaskLabel = activeTask?.label ?? "-"
  const remainingMin = Math.max(0, budgetMin - spentCredits)
  const remainingMax = Math.max(0, budgetMax - spentCredits)

  return (
    <div
      ref={rootRef}
      className={cn(
        "w-full flex flex-col bg-white overflow-hidden",
        !isCollapsed && "h-full",
        "transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      {/* ── Top nav ── */}
      <div
        ref={isCollapsed ? collapsedContentRef : undefined}
        className={cn(
        "shrink-0",
        isCollapsed
          ? "px-1.5 py-2 inline-flex w-max mx-auto flex-col items-center gap-2"
          : "flex items-center justify-between px-3 pt-3 pb-1",
      )}
      >
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          title={isCollapsed ? "Expand console" : "Collapse console"}
        >
          {isCollapsed ? <ChevronsRight size={17} strokeWidth={2} /> : <ChevronsLeft size={17} strokeWidth={2} />}
        </button>
        {!isCollapsed && (
          <span className="text-[13px] font-semibold text-slate-600">
            {phase === "complete" ? "Complete ✓" : phase === "error" ? "Error" : "Console"}
          </span>
        )}
        {!isCollapsed && <div className="w-8" />}

        {isCollapsed && (
          <>
            <div className="self-stretch border-t border-slate-100" />

            <div className="self-stretch flex flex-col items-center gap-0.5 text-center">
              <span className="text-[9px] uppercase tracking-wide text-slate-400">Spent</span>
              <span className="text-[11px] font-semibold text-slate-700 tabular-nums">⚡{spentCredits}</span>
            </div>

            <div className="self-stretch flex flex-col items-center gap-0.5 text-center">
              <span className="text-[9px] uppercase tracking-wide text-slate-400">Left</span>
              {isBudgetRange ? (
                <span className="text-[10px] font-medium text-slate-600 tabular-nums leading-tight flex flex-col">
                  <span>{remainingMin}</span>
                  <span className="text-slate-300 leading-none">~</span>
                  <span>{remainingMax}</span>
                </span>
              ) : (
                <span className="text-[10px] font-medium text-slate-600 tabular-nums">{remainingMax}</span>
              )}
            </div>

            <div className="self-stretch flex flex-col items-center gap-0.5 text-center">
              <span className="text-[9px] uppercase tracking-wide text-slate-400">Task</span>
              <span className="text-[10px] font-medium text-slate-600 max-w-[44px] truncate">{activeTaskLabel}</span>
            </div>
          </>
        )}
      </div>

      {isCollapsed ? null : (
        <>

      {/* ── Scrollable content ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        {/* Header */}
        <ConsoleHeader
          phase={phase}
          elapsed={elapsed}
          taskCount={tasks.length}
          doneCount={doneCount}
          spentCredits={spentCredits}
          budgetMin={budgetMin}
          budgetMax={budgetMax}
          isBudgetRange={isBudgetRange}
        />

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 px-5 pb-4">
          {showPlayButton && (
            <button
              onClick={handlePlay}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200",
                "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.97] shadow-lg shadow-slate-900/20",
              )}
            >
              <Play size={16} className="translate-x-[1px]" />
              {isReady ? "Play" : "Resume"}
            </button>
          )}
          {showPauseButton && (
            <button
              onClick={handlePause}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200",
                "bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-[0.97]",
              )}
            >
              <Pause size={16} />
              Pause
            </button>
          )}
          {(isRunning || isPaused) && (
            <button
              onClick={handleStop}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200",
                "bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-[0.97]",
              )}
              title="Stop workflow"
            >
              <Square size={14} className="fill-rose-500" />
            </button>
          )}
          {phase === "complete" && (
            <div className="flex items-center gap-2 text-emerald-600">
              <span className="text-sm font-semibold">All tasks complete</span>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="mx-5 h-px bg-slate-100" />

        {/* Task list */}
        <div className="py-2">
          {tasks.length === 0 && (
            <div className="flex flex-col items-center py-12 px-6 text-center">
              <p className="text-sm font-medium text-slate-400">No executable nodes found</p>
              <p className="text-xs text-slate-300 mt-1">Add nodes to the canvas to build a workflow</p>
            </div>
          )}

          {tasks.map((task, i) => (
            <div key={task.nodeId} data-task-id={task.nodeId}>
              <ConsoleTaskItem
                task={task}
                isActive={task.status === "running" || expandedTaskId === task.nodeId}
                isExpanded={expandedTaskId === task.nodeId && task.status === "waiting_manual"}
                onClick={() => handleTaskClick(task)}
              >
                {/* Manual node panel */}
                {expandedTaskId === task.nodeId && task.status === "waiting_manual" && (
                  <ConsoleNodePanel
                    nodeId={task.nodeId}
                    onGenerate={handleManualGenerate}
                    onContinue={handleManualContinue}
                    isGenerating={!!getNodes().find((n) => n.id === task.nodeId)?.data?.isGenerating}
                  />
                )}
              </ConsoleTaskItem>

              {i < tasks.length - 1 && (
                <div className="ml-[26px] w-px h-1.5 bg-slate-100" />
              )}
            </div>
          ))}

          {phase === "complete" && (
            <div className="px-5 py-3 mt-2">
              <p className="text-[10px] text-slate-400 text-center">
                Tap any task to review.
              </p>
            </div>
          )}
        </div>

        <div className="h-16" />
      </div>
        </>
      )}
    </div>
  )
}
