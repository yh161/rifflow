"use client"

/**
 * node_editor/node_editor.tsx
 *
 * Floating editor UI attached to the active node:
 *
 *  ┌──────────────────────┐  ← NodeActionBar   (above node)
 *  │  ⬆ Upload  ⬇ Dwn  🗑 │
 *  └──────────────────────┘
 *         [node]              ← GeneratingOverlay while generating
 *  ┌──────────────────────┐  ← ModeToggle   (below node)
 *  │    [Auto] [Manual]   │
 *  └──────────────────────┘
 *  ┌──────────────────────┐  ← Panel
 *  │  ...prompt panel…    │
 *  └──────────────────────┘
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import { useStore, useNodes, useReactFlow, type Node, type Edge } from "reactflow"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CustomNodeData } from "../modules/_types"
import { useUpstreamData } from "@/hooks/useUpstreamData"

import { NodeActionBar }                          from "./_action_bar"
import { GeneratingOverlay }                      from "./_overlay"
import { ModeToggle }    from "./_panels"
import type { NodeMode } from "../modules/_types"
import { MODULE_BY_ID }  from "../modules/_registry"

// ─────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────
const DEFAULT_NODE_W = 180
const DEFAULT_NODE_H = 180
const PANEL_W        = 660
const BAR_GAP        = 12
const BAR_PANEL_GAP  = 12
const ACTION_BAR_GAP = 30

// ─────────────────────────────────────────────
// Polling config
// ─────────────────────────────────────────────
const POLL_INTERVAL_MS = 1500

// ─────────────────────────────────────────────
// NodeEditor
// ─────────────────────────────────────────────
export interface NodeEditorProps {
  nodeId: string
  onClose: () => void
  onDelete: (nodeId: string) => void
  // ── Loop instance actions (provided by canvas.tsx) ──
  onLoopAddInstance?: (loopId: string) => void
  onLoopDeleteInstance?: (loopId: string, instanceIdx: number) => void
  onLoopSwitchView?: (loopId: string, viewIdx: number) => void
  onLoopRelease?: (loopId: string) => void
}

export function NodeEditor({
  nodeId,
  onClose,
  onDelete,
  onLoopAddInstance,
  onLoopDeleteInstance,
  onLoopSwitchView,
  onLoopRelease,
}: NodeEditorProps) {
  const nodes        = useNodes()
  const { setNodes, getNodes, getEdges } = useReactFlow()
  const edges = getEdges()
  const transform    = useStore((s) => s.transform)
  const [tx, ty, zoom] = transform

  const node = nodes.find((n) => n.id === nodeId)
  const data = node?.data as CustomNodeData | undefined

  // ── Upstream data for resolving {{nodeId}} references ──
  const upstreamData = useUpstreamData(nodeId)

  // ── Mode toggle ──────────────────────────────
  const [mode, setMode] = useState<NodeMode>(() => (data?.mode ?? "manual") as NodeMode)

  // Sync mode from data when switching to a different node
  const prevNodeIdRef = useRef(nodeId)
  useEffect(() => {
    if (nodeId !== prevNodeIdRef.current) {
      setMode((data?.mode ?? "manual") as NodeMode)
      prevNodeIdRef.current = nodeId
    }
  }, [nodeId, data?.mode])

  // ── Text-edit mode ───────────────────────────
  const [isTextEditing, setIsTextEditing] = useState(false)

  // ── Generating state ─────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const [genProgress,  setGenProgress]  = useState(0)
  const genTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeJobRef  = useRef<string | null>(null) // jobId currently being polled

  // ── Workflow execution state (for lasso) ─────
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false)
  const workflowPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const workflowJobRef  = useRef<string | null>(null)

  // ── Batch generation state ───────────────────
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)
  const batchAbortRef = useRef<AbortController | null>(null)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })

  // ── Refs for accessing latest nodes/edges in async operations ──
  const getNodesRef = useRef(() => getNodes())
  const getEdgesRef = useRef(() => getEdges())
  getNodesRef.current = () => getNodes()
  getEdgesRef.current = () => getEdges()

  // ── Cleanup on unmount ───────────────────────
  useEffect(() => () => {
    if (genTimerRef.current)  clearInterval(genTimerRef.current)
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
  }, [])

  // ── Apply image result to node ───────────────
  const applyImageResult = useCallback(
    async (b64: string, mime: string) => {
      const byteString = atob(b64)
      const ab         = new ArrayBuffer(byteString.length)
      const ia         = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
      const blob = new Blob([ab], { type: mime })

      // Upload to MinIO → persistent URL that survives page refreshes
      let src: string
      try {
        const form = new FormData()
        form.append(
          'file',
          new File([blob], `generated.${mime.split('/')[1] || 'png'}`, { type: mime }),
        )
        const res  = await fetch('/api/upload', { method: 'POST', body: form })
        const json = await res.json()
        if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
        src = json.url as string
      } catch (err) {
        console.error('[applyImageResult] MinIO upload failed, falling back to blob URL:', err)
        src = URL.createObjectURL(blob)
      }

      const img = new window.Image()
      img.src = src
      await new Promise<void>((resolve) => { img.onload = () => resolve() })

      const nw      = img.naturalWidth
      const nh      = img.naturalHeight
      const minSide = Math.min(nw, nh)
      const scale   = 180 / minSide
      const w       = Math.round(nw * scale)
      const h       = Math.round(nh * scale)

      setNodes((ns) => ns.map((n) => {
        if (n.id !== nodeId) return n
        return {
          ...n,
          style: { ...n.style, width: w, height: h },
          data: {
            ...n.data,
            src,
            naturalWidth:  nw,
            naturalHeight: nh,
            width:  w,
            height: h,
            isGenerating:  false,
            activeJobId:   undefined,
          },
        }
      }))
    },
    [nodeId, setNodes],
  )

  // ── Stop generating UI ───────────────────────
  const stopGenerating = useCallback(() => {
    if (genTimerRef.current)  clearInterval(genTimerRef.current)
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    activeJobRef.current = null
    setIsGenerating(false)
    setGenProgress(0)
    setNodes((ns) => ns.map((n) =>
      n.id !== nodeId ? n : { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
    ))
  }, [nodeId, setNodes])

  // ── Poll a job until terminal state ─────────
  const startPolling = useCallback(
    (jobId: string) => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)

      pollTimerRef.current = setInterval(async () => {
        // Abandon if a newer job has taken over
        if (activeJobRef.current !== jobId) {
          clearInterval(pollTimerRef.current!)
          return
        }

        try {
          const res     = await fetch(`/api/jobs/${jobId}`)
          const rawText = await res.text()
          let json: any
          try { json = JSON.parse(rawText) } catch {
            console.error("[poll] non-JSON response:", rawText.slice(0, 300))
            return // 网络/服务端临时错误，继续轮询
          }

          if (json.status === "done") {
            clearInterval(pollTimerRef.current!)
            if (genTimerRef.current) clearInterval(genTimerRef.current)
            setGenProgress(1)

            // Conflict check: if user already started a new job, discard
            if (activeJobRef.current !== jobId) return

            const result = json.result as Record<string, any>

            if (data?.type === "image") {
              await applyImageResult(result.b64, result.mime)
            } else {
              setNodes((ns) => ns.map((n) =>
                n.id !== nodeId ? n : {
                  ...n,
                  data: { ...n.data, content: result.content, isGenerating: false, activeJobId: undefined },
                }
              ))
            }

            setIsGenerating(false)
            setGenProgress(0)
            activeJobRef.current = null

          } else if (json.status === "failed") {
            clearInterval(pollTimerRef.current!)
            console.error("[generate] job failed:", json.error)
            stopGenerating()
          }
          // "pending" | "running" → continue polling
        } catch (err) {
          console.error("[generate] poll error:", err)
          // Network error — keep polling (transient)
        }
      }, POLL_INTERVAL_MS)
    },
    [data?.type, nodeId, setNodes, applyImageResult, stopGenerating],
  )

  // ─────────────────────────────────────────────
  // handleStartGenerate — creates async job, starts polling
  // Interface identical to original so ModalContent props unchanged.
  // ─────────────────────────────────────────────
  const handleStartGenerate = useCallback(
    async (prompt: string, model: string, _params: Record<string, string>) => {
      setIsGenerating(true)
      setGenProgress(0)
      setNodes((ns) => ns.map((n) =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, isEditing: false, isGenerating: true } }
      ))

      // Fake progress crawl while waiting
      let p = 0
      if (genTimerRef.current) clearInterval(genTimerRef.current)
      genTimerRef.current = setInterval(() => {
        p += 0.006 + Math.random() * 0.006
        if (p >= 0.9) { clearInterval(genTimerRef.current!); p = 0.9 }
        setGenProgress(p)
      }, 50)

      try {
        const res  = await fetch("/api/jobs", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            nodeId,
            nodeType: data?.type ?? "text",
            prompt,
            model,
            upstreamData,
          }),
        })
        const json = await res.json()

        if (!res.ok || json.error) {
          throw new Error(json.error ?? `Server error ${res.status}`)
        }

        const { jobId } = json as { jobId: string }
        activeJobRef.current = jobId

        // Tag the node so conflict detection works after refresh
        setNodes((ns) => ns.map((n) =>
          n.id !== nodeId ? n : { ...n, data: { ...n.data, activeJobId: jobId } }
        ))

        startPolling(jobId)

      } catch (err) {
        console.error("[generate]", err)
        stopGenerating()
      }
    },
    [nodeId, data?.type, setNodes, startPolling, stopGenerating, upstreamData],
  )

  const handleStopGenerate = useCallback(() => {
    stopGenerating()
  }, [stopGenerating])

  // ── File input ref ───────────────────────────
  const uploadInputRef      = useRef<HTMLInputElement>(null)
  const videoUploadInputRef = useRef<HTMLInputElement>(null)

  // ── Data update helper ───────────────────────
  const handleUpdate = useCallback(
    (updates: Partial<CustomNodeData>) => {
      setNodes((ns) => ns.map((n) => {
        if (n.id !== nodeId) return n
        const next = { ...n, data: { ...n.data, ...updates } }
        if (updates.width !== undefined || updates.height !== undefined) {
          next.style = {
            ...n.style,
            ...(updates.width  !== undefined && { width:  updates.width  }),
            ...(updates.height !== undefined && { height: updates.height }),
          }
        }
        return next
      }))
    },
    [nodeId, setNodes]
  )

  const handleUpdateRef = useRef(handleUpdate)
  handleUpdateRef.current = handleUpdate

  const handleModeChange = useCallback((m: NodeMode) => {
    setMode(m)
    handleUpdate({ mode: m })
  }, [handleUpdate])

  // ── Inject onDataChange once on mount ────────
  useEffect(() => {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== nodeId) return n
      const extra = (n.data.type === 'batch' || n.data.type === 'cycle')
        ? { onDelete: () => onDelete(nodeId) }
        : {}
      return { ...n, data: { ...n.data, onDataChange: (u: Partial<CustomNodeData>) => handleUpdateRef.current(u), ...extra } }
    }))
    return () => {
      setNodes((ns) => ns.map((n) =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, isEditing: false, onDataChange: undefined, onDelete: undefined } }
      ))
    }
  }, [nodeId, setNodes, onDelete])

  // ── Sync isEditing → node data ───────────────
  const isEditingForNode =
    data?.type === "image" ? !isGenerating :
    data?.type === "video" ? !isGenerating :
    data?.type === "gate"  ? !isGenerating :
    data?.type === "batch" ? !isGenerating :
    data?.type === "cycle" ? !isGenerating :
    data?.type === "seed"  ? isTextEditing :
    isTextEditing

  useEffect(() => {
    if (data?.type === "text" || data?.type === "seed") return
    setNodes((ns) => ns.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, isEditing: isEditingForNode } }
    }))
  }, [nodeId, isEditingForNode, setNodes, data?.type])

  const handleToggleTextEdit = useCallback(() => {
    const entering = !isTextEditing
    setIsTextEditing(entering)
    if (entering) {
      setNodes((ns) => ns.map((n) =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, isEditing: true } }
      ))
    } else {
      setTimeout(() => {
        setNodes((ns) => ns.map((n) =>
          n.id !== nodeId ? n : { ...n, data: { ...n.data, isEditing: false } }
        ))
      }, 0)
    }
  }, [isTextEditing, nodeId, setNodes])

  // ── Close on Escape ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // ── Delete ───────────────────────────────────
  const handleDeleteNode = useCallback(() => onDelete(nodeId), [nodeId, onDelete])

  // ── Loop instance controls (flat model) ──────
  const handleLoopAddInstance = useCallback(() => {
    onLoopAddInstance?.(nodeId)
  }, [nodeId, onLoopAddInstance])

  const handleLoopDeleteInstance = useCallback(() => {
    const idx = data?.currentInstance ?? -1
    if (idx < 0) return
    onLoopDeleteInstance?.(nodeId, idx)
  }, [nodeId, data?.currentInstance, onLoopDeleteInstance])

  const handleLoopGoTo = useCallback((idx: number) => {
    onLoopSwitchView?.(nodeId, idx)
  }, [nodeId, onLoopSwitchView])

  // ── Loop release with confirmation ───────────
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false)

  const handleLoopReleaseClick = useCallback(() => {
    const count = data?.instanceCount ?? 0
    if (count > 0) {
      setShowReleaseConfirm(true)
    } else {
      onLoopRelease?.(nodeId)
    }
  }, [nodeId, data?.instanceCount, onLoopRelease])

  const handleReleaseConfirm = useCallback(() => {
    setShowReleaseConfirm(false)
    onLoopRelease?.(nodeId)
  }, [nodeId, onLoopRelease])

  const handleReleaseCancel = useCallback(() => {
    setShowReleaseConfirm(false)
  }, [])

  // ── Image / Video upload ─────────────────────
  const handleUploadImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return

    // Show the image immediately with a temporary blob URL for instant feedback
    const tempSrc = URL.createObjectURL(file)
    const img     = new window.Image()

    img.onload = async () => {
      const minSide = Math.min(img.naturalWidth, img.naturalHeight)
      const scale   = 180 / minSide
      const w       = Math.round(img.naturalWidth  * scale)
      const h       = Math.round(img.naturalHeight * scale)

      // Apply immediately so the user sees the image right away
      handleUpdateRef.current({
        src:           tempSrc,
        fileName:      file.name,
        naturalWidth:  img.naturalWidth,
        naturalHeight: img.naturalHeight,
        width:  w,
        height: h,
      })

      // Upload to MinIO in the background → swap to persistent URL
      try {
        const form = new FormData()
        form.append('file', file)
        const res  = await fetch('/api/upload', { method: 'POST', body: form })
        const json = await res.json() as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
        handleUpdateRef.current({ src: json.url })
        URL.revokeObjectURL(tempSrc)
      } catch (err) {
        console.error('[handleUploadImage] MinIO upload failed, keeping blob URL:', err)
        // Blob URL still works this session; warn that it won't survive refresh
      }
    }

    img.src = tempSrc
  }, []) // intentionally no deps — uses handleUpdateRef to avoid stale closure

  const handleUploadVideo = useCallback((file: File) => {
    if (!file.type.startsWith("video/")) return
    const videoSrc = URL.createObjectURL(file)
    const vid = document.createElement("video")
    vid.preload = "metadata"
    vid.onloadedmetadata = () => {
      const secs      = Math.round(vid.duration)
      const mins      = Math.floor(secs / 60)
      const remainder = secs % 60
      const videoDuration = mins > 0
        ? `${mins}:${String(remainder).padStart(2, "0")}`
        : `${secs}s`
      const MIN   = 180
      const ratio = vid.videoWidth / vid.videoHeight || 1
      const h     = ratio >= 1 ? MIN : Math.round(MIN / ratio)
      const w     = ratio >= 1 ? Math.round(MIN * ratio) : MIN
      URL.revokeObjectURL(vid.src)
      handleUpdate({ videoSrc, fileName: file.name, videoDuration, width: w, height: h })
    }
    vid.src = videoSrc
  }, [handleUpdate])

  // ── Download ──────────────────────────────────
  const handleDownload = useCallback(() => {
    const href = data?.type === "video" ? data.videoSrc : data?.src
    if (!href) return
    const a = document.createElement("a")
    a.href = href
    a.download = data?.fileName || (data?.type === "video" ? "video" : "image")
    a.click()
  }, [data?.type, data?.videoSrc, data?.src, data?.fileName])

  // ── Lasso workflow execution ─────────────────
  const stopWorkflowPolling = useCallback(() => {
    if (workflowPollRef.current) {
      clearInterval(workflowPollRef.current)
      workflowPollRef.current = null
    }
    workflowJobRef.current = null
    setIsExecutingWorkflow(false)
  }, [])

  const startWorkflowPolling = useCallback((workflowJobId: string) => {
    workflowJobRef.current = workflowJobId
    setIsExecutingWorkflow(true)

    workflowPollRef.current = setInterval(async () => {
      if (workflowJobRef.current !== workflowJobId) {
        stopWorkflowPolling()
        return
      }

      try {
        const res = await fetch(`/api/execute/workflow?workflowJobId=${workflowJobId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()

        if (json.status === "completed") {
          console.log("[workflow] completed:", json.results)
          
          // Apply workflow results to child nodes
          const results = json.results as Record<string, Record<string, unknown>>
          if (results) {
            setNodes((ns) => ns.map((n) => {
              const nodeResult = results[n.id]
              if (!nodeResult) return n

              const nodeType = n.data?.type
              
              // Handle image node results
              if (nodeType === "image" && nodeResult.b64 && nodeResult.mime) {
                // For image nodes, we need to upload and apply the result
                // Use a helper to handle async image processing
                handleWorkflowImageResult(n.id, String(nodeResult.b64), String(nodeResult.mime))
                return { ...n, data: { ...n.data, isGenerating: false } }
              }
              
              // Handle text/gate/seed node results
              if ((nodeType === "text" || nodeType === "gate" || nodeType === "seed") && nodeResult.content !== undefined) {
                return {
                  ...n,
                  data: { ...n.data, content: String(nodeResult.content), isGenerating: false }
                }
              }
              
              // Handle video node results
              if (nodeType === "video" && nodeResult.videoSrc) {
                return {
                  ...n,
                  data: { 
                    ...n.data, 
                    videoSrc: String(nodeResult.videoSrc),
                    videoDuration: nodeResult.videoDuration ? String(nodeResult.videoDuration) : n.data?.videoDuration,
                    isGenerating: false 
                  }
                }
              }
              
              // Default: merge result data into node data
              return { ...n, data: { ...n.data, ...nodeResult, isGenerating: false } }
            }))
          }
          
          stopWorkflowPolling()
        } else if (json.status === "failed") {
          console.error("[workflow] failed:", json.error, "jobs:", json.jobs)
          stopWorkflowPolling()
        }
        // pending | running → continue polling
      } catch (err) {
        console.error("[workflow] poll error:", err)
      }
    }, POLL_INTERVAL_MS)
  }, [stopWorkflowPolling, setNodes])

  // Helper to handle async image result from workflow
  const handleWorkflowImageResult = useCallback(async (targetNodeId: string, b64: string, mime: string) => {
    const byteString = atob(b64)
    const ab = new ArrayBuffer(byteString.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
    const blob = new Blob([ab], { type: mime })

    // Upload to MinIO → persistent URL
    let src: string
    try {
      const form = new FormData()
      form.append(
        'file',
        new File([blob], `generated.${mime.split('/')[1] || 'png'}`, { type: mime }),
      )
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
      src = json.url as string
    } catch (err) {
      console.error('[workflow image] MinIO upload failed, falling back to blob URL:', err)
      src = URL.createObjectURL(blob)
    }

    const img = new window.Image()
    img.src = src
    await new Promise<void>((resolve) => { img.onload = () => resolve() })

    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const minSide = Math.min(nw, nh)
    const scale = 180 / minSide
    const w = Math.round(nw * scale)
    const h = Math.round(nh * scale)

    setNodes((ns) => ns.map((n) => {
      if (n.id !== targetNodeId) return n
      return {
        ...n,
        style: { ...n.style, width: w, height: h },
        data: {
          ...n.data,
          src,
          naturalWidth: nw,
          naturalHeight: nh,
          width: w,
          height: h,
          isGenerating: false,
          activeJobId: undefined,
        },
      }
    }))
  }, [setNodes])

  const handleExecuteWorkflow = useCallback(async () => {
    if (!node || data?.type !== "lasso") return

    // Find all child nodes (nodes that have this lasso as parentNode)
    const childNodes = nodes.filter((n) => n.parentNode === nodeId)
    if (childNodes.length === 0) {
      console.warn("[workflow] No nodes inside lasso")
      return
    }

    // Get edges between child nodes
    const childNodeIds = new Set(childNodes.map((n) => n.id))
    const childEdges = edges.filter(
      (e) => childNodeIds.has(e.source) && childNodeIds.has(e.target)
    )

    setIsExecutingWorkflow(true)

    try {
      const res = await fetch("/api/execute/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lassoNodeId: nodeId,
          nodes: childNodes,
          edges: childEdges,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Server error ${res.status}`)
      }

      const { workflowJobId } = await res.json()
      startWorkflowPolling(workflowJobId)
    } catch (err) {
      console.error("[workflow] execute failed:", err)
      setIsExecutingWorkflow(false)
    }
  }, [node, data?.type, nodeId, nodes, edges, startWorkflowPolling])

  // ── Batch generation with auto-execution ─────────────────────
  /**
   * Batch auto-generation logic:
   * 1. Call batch API to get seeds from LLM
   * 2. For each seed:
   *    - Call onLoopAddInstance (reuses manual creation logic)
   *    - Fill the seed node with generated content
   *    - Execute the subflow using workflow service
   * 
   * This approach reuses the proven manual instance creation logic
   * to avoid conflicts with existing action bar functionality.
   */
  const handleBatchGenerate = useCallback(async (prompt: string, model: string, params: Record<string, string>) => {
    if (!node || data?.type !== "batch") return

    const maxInstances = parseInt(params.instanceMax || "3", 10)

    // Abort any previous batch generation
    if (batchAbortRef.current) {
      batchAbortRef.current.abort()
    }
    batchAbortRef.current = new AbortController()
    const abortSignal = batchAbortRef.current.signal

    setIsBatchGenerating(true)
    setBatchProgress({ current: 0, total: 0 })

    try {
      // Step 0: Call batch API to get seeds
      const batchRes = await fetch("/api/execute/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model,
          maxInstances,
          upstreamContent: upstreamData.map(u => u.content).join("\n"),
        }),
        signal: abortSignal,
      })

      if (!batchRes.ok) {
        const err = await batchRes.json()
        throw new Error(err.error || `Batch API error ${batchRes.status}`)
      }

      const batchResult = await batchRes.json() as {
        count: number
        seeds: Array<{ content: string; description?: string }>
      }

      const seeds = batchResult.seeds
      if (!seeds || seeds.length === 0) {
        throw new Error("No seeds generated")
      }

      setBatchProgress({ current: 0, total: seeds.length })

      // Step 1-3: For each seed, create instance, fill seed, execute subflow
      for (let i = 0; i < seeds.length; i++) {
        if (abortSignal.aborted) break

        const seed = seeds[i]

        // Step 1: Create instance using the same logic as manual "Add instance" button
        // This ensures all the existing logic (node cloning, edge cloning, visibility) works correctly
        onLoopAddInstance?.(nodeId)

        // Wait for React to render the new instance and update refs
        await new Promise(r => setTimeout(r, 100))

        // Get the latest nodes/edges from refs (they're updated by handleLoopAddInstance)
        const currentNodes = getNodesRef.current()
        const currentEdges = getEdgesRef.current()

        // Find the batch node to get current instance index
        const batchNode = currentNodes.find((n: Node) => n.id === nodeId)
        if (!batchNode) continue

        // The new instance index (handleLoopAddInstance sets currentInstance to newIdx)
        const instanceIdx = batchNode.data?.currentInstance ?? i

        // Find the seed node in the current instance (seed is auto-created with isSeed flag)
        const seedNode = currentNodes.find((n: Node) =>
          n.data?.loopId === nodeId &&
          n.data?.instanceIdx === instanceIdx &&
          n.data?.type === "seed"
        )

        if (seedNode) {
          // Step 2: Fill seed content with generated content
          setNodes((ns) => ns.map((n: Node) => {
            if (n.id !== seedNode.id) return n
            return {
              ...n,
              data: { ...n.data, content: seed.content }
            }
          }))
        } else {
          console.warn(`[batch] No seed node found for instance ${instanceIdx}`)
        }

        // Wait for seed content to be applied
        await new Promise(r => setTimeout(r, 50))

        // Step 3: Execute the subflow for this instance
        // Get fresh nodes/edges after seed update
        const latestNodes = getNodesRef.current()
        const latestEdges = getEdgesRef.current()

        // Find all nodes and edges in this instance
        const instanceNodes = latestNodes.filter((n: Node) =>
          n.data?.loopId === nodeId && n.data?.instanceIdx === instanceIdx
        )
        const instanceNodeIds = new Set(instanceNodes.map((n: Node) => n.id))
        const instanceEdges = latestEdges.filter((e: Edge) =>
          instanceNodeIds.has(e.source) && instanceNodeIds.has(e.target)
        )

        if (instanceNodes.length > 0) {
          // Execute workflow for this instance using the workflow service
          try {
            const wfRes = await fetch("/api/execute/workflow", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lassoNodeId: `${nodeId}-instance-${instanceIdx}`,
                nodes: instanceNodes,
                edges: instanceEdges,
              }),
              signal: abortSignal,
            })

            if (!wfRes.ok) {
              const err = await wfRes.json()
              throw new Error(err.error || `Workflow error ${wfRes.status}`)
            }

            const { workflowJobId } = await wfRes.json()

            // Poll for workflow completion
            await pollWorkflowToCompletion(workflowJobId, abortSignal)

          } catch (wfErr) {
            console.error(`[batch] Instance ${instanceIdx + 1} workflow failed:`, wfErr)
            // Continue with next instance even if this one failed
          }
        }

        setBatchProgress({ current: i + 1, total: seeds.length })
      }

    } catch (err) {
      console.error("[batch] generation failed:", err)
    } finally {
      setIsBatchGenerating(false)
      batchAbortRef.current = null
    }
  }, [node, data?.type, nodeId, upstreamData, onLoopAddInstance, setNodes])

  /**
   * Poll workflow until completion or failure
   */
  const pollWorkflowToCompletion = async (workflowJobId: string, abortSignal: AbortSignal): Promise<void> => {
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        if (abortSignal.aborted) {
          reject(new Error("Aborted"))
          return
        }

        try {
          const statusRes = await fetch(`/api/execute/workflow?workflowJobId=${workflowJobId}`, { signal: abortSignal })
          if (!statusRes.ok) {
            reject(new Error("Failed to check workflow status"))
            return
          }
          const status = await statusRes.json()

          if (status.status === "completed") {
            // Apply results to nodes
            if (status.results) {
              setNodes((ns) => ns.map((n) => {
                const nodeResult = status.results[n.id]
                if (!nodeResult) return n
                return { ...n, data: { ...n.data, ...nodeResult, isGenerating: false } }
              }))
            }
            resolve()
          } else if (status.status === "failed") {
            reject(new Error(status.error || "Workflow failed"))
          } else {
            // Still running, check again after delay
            setTimeout(checkStatus, POLL_INTERVAL_MS)
          }
        } catch (e) {
          reject(e)
        }
      }
      checkStatus()
    })
  }

  const handleStopBatch = useCallback(() => {
    if (batchAbortRef.current) {
      batchAbortRef.current.abort()
      batchAbortRef.current = null
    }
    setIsBatchGenerating(false)
  }, [])

  // Cleanup workflow polling on unmount
  useEffect(() => {
    return () => {
      if (workflowPollRef.current) clearInterval(workflowPollRef.current)
      if (batchAbortRef.current) batchAbortRef.current.abort()
    }
  }, [])

  if (!node || !data) return null

  // ── Screen coordinates ────────────────────────
  // Read dimensions from: style > data > default
  const absPos  = (node as any).positionAbsolute ?? node.position
  const actualW = (node.style?.width  as number | undefined) ?? data?.width  ?? DEFAULT_NODE_W
  const actualH = (node.style?.height as number | undefined) ?? data?.height ?? DEFAULT_NODE_H
  const screenX = absPos.x * zoom + tx
  const screenY = absPos.y * zoom + ty
  const nodeW   = actualW * zoom
  const nodeH   = actualH * zoom
  const centerX = screenX + nodeW / 2

  const actionBarBottom = screenY - ACTION_BAR_GAP
  const barTop          = screenY + nodeH + BAR_GAP
  const panelTop        = barTop + 62 + BAR_PANEL_GAP

  const isContainerNode    = data.type === 'batch' || data.type === 'cycle'
  const loopInstanceCount  = isContainerNode ? (data.instanceCount ?? 0) : 0
  const isLoopInstanceView = isContainerNode && (data.currentInstance ?? -1) >= 0

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={uploadInputRef}
        type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleUploadImage(f)
          e.target.value = ""
        }}
      />
      <input
        ref={videoUploadInputRef}
        type="file" accept="video/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleUploadVideo(f)
          e.target.value = ""
        }}
      />

      {/* NodeActionBar */}
      <div
        className="absolute z-[500] pointer-events-auto"
        style={{
          left: centerX, top: actionBarBottom,
          transform: "translate(-50%, -100%)",
          pointerEvents: isGenerating ? "none" : "auto",
          opacity:       isGenerating ? 0.35 : 1,
          transition:    "opacity 200ms ease",
        }}
      >
        <NodeActionBar
          data={data}
          isTextEditing={isTextEditing}
          onToggleTextEdit={handleToggleTextEdit}
          onUpload={() => data.type === "video" ? videoUploadInputRef.current?.click() : uploadInputRef.current?.click()}
          onDownload={handleDownload}
          onDelete={handleDeleteNode}
          onLoopRelease={handleLoopReleaseClick}
          onLoopAddInstance={handleLoopAddInstance}
          onLoopDeleteInstance={handleLoopDeleteInstance}
          onLoopGoTo={handleLoopGoTo}
          loopInstanceCount={loopInstanceCount}
          onExecute={handleExecuteWorkflow}
          isExecuting={isExecutingWorkflow}
        />
      </div>

      {/* Generating overlay */}
      {isGenerating && (
        <div className="absolute z-[500] pointer-events-none" style={{ left: screenX, top: screenY }}>
          <GeneratingOverlay screenW={nodeW} screenH={nodeH} progress={genProgress} zoom={zoom} />
        </div>
      )}

      {/* ModeToggle + Panel */}
      {!isLoopInstanceView && (<>
      <div
        className="absolute z-[500] pointer-events-auto"
        style={{
          left: centerX - PANEL_W / 2, top: barTop, width: PANEL_W,
          display: "flex", justifyContent: "center",
          pointerEvents: isGenerating ? "none" : "auto",
          opacity:       isGenerating ? 0.35 : 1,
          transition:    "opacity 200ms ease",
        }}
      >
        <ModeToggle mode={mode} onChange={handleModeChange} />
      </div>

      <div
        className="absolute z-[500] pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden"
        style={{ left: centerX - PANEL_W / 2, top: panelTop, width: PANEL_W }}
      >
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-slate-100">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {MODULE_BY_ID[data.type]?.meta.panelTitle ?? data.type}
          </span>
          <button
            onClick={isGenerating ? undefined : onClose}
            className={cn(
              "p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors",
              isGenerating && "opacity-30 cursor-not-allowed pointer-events-none"
            )}
          >
            <X size={13} />
          </button>
        </div>
        {(() => {
          const mod = MODULE_BY_ID[data.type]
          if (!mod?.ModalContent) return null
          
          // For batch nodes, use the batch-specific generation handler
          const isBatch = data.type === 'batch'
          const generationProps = isBatch ? {
            isGenerating: isBatchGenerating,
            onGenerate: handleBatchGenerate,
            onStop: handleStopBatch,
          } : {
            isGenerating,
            onGenerate: handleStartGenerate,
            onStop: handleStopGenerate,
          }
          
          return (
            <mod.ModalContent
              key={nodeId}
              nodeId={nodeId}
              data={data as any}
              onUpdate={handleUpdate}
              onClose={onClose}
              onDelete={() => handleDeleteNode()}
              mode={mode}
              {...generationProps}
            />
          )
        })()}
      </div>
      </>)}

      {/* Release confirmation dialog */}
      {showReleaseConfirm && (
        <div
          className="absolute z-[800] pointer-events-auto max-w-[400px]"
          style={{
            left: centerX, top: actionBarBottom + 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div
            className="bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/80 p-4 min-w-[300px]"
            style={{ animation: "pickerIn 150ms ease-out both" }}
          >
            <style>{`
              @keyframes pickerIn {
                from { opacity: 0; transform: translateY(4px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <p className="text-sm text-slate-700 font-medium mb-1">
              Release {data.type === 'cycle' ? 'cycle' : 'batch'}?
            </p>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              This will delete all {data.instanceCount ?? 0} instance{(data.instanceCount ?? 0) !== 1 ? "s" : ""} and release
              template nodes back to the canvas. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleReleaseCancel}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReleaseConfirm}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200/80 transition-colors"
              >
                Delete instances &amp; release
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}