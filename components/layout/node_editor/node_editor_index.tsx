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
import type { UpstreamNodeData } from "@/hooks/useUpstreamData"
import { resolvePromptToMultimodal } from "@/lib/prompt-resolver"
import type { MultimodalContent } from "@/lib/prompt-resolver"

import { NodeActionBar }                          from "./_action_bar"
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
  onLassoRelease?: (lassoId: string) => void
}

export function NodeEditor({
  nodeId,
  onClose,
  onDelete,
  onLoopAddInstance,
  onLoopDeleteInstance,
  onLoopSwitchView,
  onLoopRelease,
  onLassoRelease,
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

  // ── Generating state — read from node data (polling lives in NodeWrapper) ──
  const isGenerating = !!data?.isGenerating

  // ── Workflow execution state (for lasso) ─────
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false)
  const workflowPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const workflowJobRef  = useRef<string | null>(null)

  // ── Batch seed-ready polling ref ─────────────
  // While seeds are being generated we do a short local poll.
  // Once /continue is POSTed, _polling.ts (NodeWrapper) handles the rest.
  const batchSeedPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Refs for accessing latest nodes/edges in async operations ──
  const getNodesRef = useRef(() => getNodes())
  const getEdgesRef = useRef(() => getEdges())
  getNodesRef.current = () => getNodes()
  getEdgesRef.current = () => getEdges()

  // ─────────────────────────────────────────────
  // handleStartGenerate — creates job, writes to node.data.
  // Polling and progress live in NodeWrapper (_polling.ts).
  // ─────────────────────────────────────────────
  const handleStartGenerate = useCallback(
    async (prompt: string, model: string, _params: Record<string, string>) => {
      // Signal generating immediately so the overlay appears
      setNodes((ns) => ns.map((n) =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, isEditing: false, isGenerating: true } }
      ))

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

        // Writing activeJobId triggers polling in NodeWrapper
        setNodes((ns) => ns.map((n) =>
          n.id !== nodeId ? n : { ...n, data: { ...n.data, activeJobId: jobId } }
        ))

      } catch (err) {
        console.error("[generate]", err)
        setNodes((ns) => ns.map((n) =>
          n.id !== nodeId ? n : { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
        ))
      }
    },
    [nodeId, data?.type, setNodes, upstreamData],
  )

  const handleStopGenerate = useCallback(() => {
    setNodes((ns) => ns.map((n) =>
      n.id !== nodeId ? n : { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
    ))
  }, [nodeId, setNodes])

  // ── Filter generation — builds full multimodal prompt on the frontend ─────
  // Separates REF edges (condition context) from IN edges (items to classify).
  // Sends pre-built content + filterItems metadata to /api/jobs.
  const handleFilterGenerate = useCallback(
    async (prompt: string, model: string, _params: Record<string, string>) => {
      const currentNodes = getNodes()
      const currentEdges = getEdges()

      const allIncoming = currentEdges.filter((e) => e.target === nodeId)
      const refEdges    = allIncoming.filter((e) => e.targetHandle === 'ref')
      const inEdges     = allIncoming.filter(
        (e) => e.targetHandle === 'in' || e.targetHandle === 'left' || !e.targetHandle
      )

      if (inEdges.length === 0) return // Nothing to filter

      const filterInputMode = (data?.filterInputMode ?? 'label') as 'label' | 'content'

      // Signal generating immediately
      setNodes((ns) => ns.map((n) =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, isEditing: false, isGenerating: true } }
      ))

      try {
        // ── Build item blocks ──────────────────────────────────────────────
        const systemBlock: MultimodalContent = {
          type: 'text',
          text: `You are a FILTER node in a workflow. Evaluate each numbered item against the condition and classify each as PASS or FAIL.\nRespond ONLY with valid JSON (no markdown, no explanation):\n{"passed":[1,3],"filtered":[2],"reply":"brief explanation"}\nNumbers are 1-based indices. Every item must appear in either "passed" or "filtered". "reply" is a short sentence explaining your decisions.`,
        }

        const itemsHeaderBlock: MultimodalContent = { type: 'text', text: '\nItems to evaluate:' }
        const itemBlocks: MultimodalContent[] = [itemsHeaderBlock]
        const filterItems: Array<{ id: string; label?: string; type?: string }> = []

        for (let i = 0; i < inEdges.length; i++) {
          const edge       = inEdges[i]
          const sourceNode = currentNodes.find((n) => n.id === edge.source)
          if (!sourceNode) continue

          const d        = sourceNode.data as CustomNodeData
          const nodeType = d.type || 'text'
          const label    = d.label || nodeType

          filterItems.push({ id: sourceNode.id, label, type: nodeType })

          const header = `[${i + 1}] "${label}" (${nodeType})`
          itemBlocks.push({ type: 'text', text: header })

          if (filterInputMode === 'content') {
            if (nodeType === 'image' && d.src) {
              // Convert local/blob image URLs to base64 so the LLM can see them
              if (d.src.startsWith('blob:') || /^https?:\/\/(localhost|127\.|minio|.*\.local|.*\.internal)/.test(d.src)) {
                try {
                  const fetchRes = await fetch(d.src)
                  const blob     = await fetchRes.blob()
                  const base64   = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onloadend = () => resolve(reader.result as string)
                    reader.onerror   = reject
                    reader.readAsDataURL(blob)
                  })
                  itemBlocks.push({ type: 'image_url', image_url: { url: base64, detail: 'low' } })
                } catch {
                  itemBlocks.push({ type: 'text', text: '[Image unavailable]' })
                }
              } else {
                itemBlocks.push({ type: 'image_url', image_url: { url: d.src, detail: 'low' } })
              }
            } else if (d.content) {
              const truncated = d.content.slice(0, 400)
              itemBlocks.push({ type: 'text', text: `"${truncated}${d.content.length > 400 ? '…' : ''}"` })
            }
          }
        }

        // ── Resolve condition prompt with REF references ───────────────────
        // upstreamData (from useUpstreamData) already has blob→base64 conversion.
        // Filter it to only REF-connected nodes.
        const refIds        = new Set(refEdges.map((e) => e.source))
        const refUpstream   = upstreamData.filter((u) => refIds.has(u.id))
        const conditionContent = await resolvePromptToMultimodal(prompt, refUpstream)

        const conditionHeader: MultimodalContent = { type: 'text', text: '\nCondition:' }
        const instruction:     MultimodalContent = {
          type: 'text',
          text: '\nReturn ONLY JSON: {"passed":[indices],"filtered":[indices],"reply":"explanation"}',
        }

        const fullContent: MultimodalContent[] = [
          systemBlock,
          ...itemBlocks,
          conditionHeader,
          ...conditionContent,
          instruction,
        ]

        // ── Send to backend ────────────────────────────────────────────────
        const res  = await fetch('/api/jobs', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            nodeId,
            nodeType: 'filter',
            content:  fullContent,
            model,
            filterItems,
          }),
        })
        const json = await res.json()
        if (!res.ok || json.error) throw new Error(json.error ?? `Server error ${res.status}`)

        setNodes((ns) => ns.map((n) =>
          n.id !== nodeId ? n : { ...n, data: { ...n.data, activeJobId: json.jobId } }
        ))
      } catch (err) {
        console.error('[filter generate]', err)
        setNodes((ns) => ns.map((n) =>
          n.id !== nodeId ? n : { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
        ))
      }
    },
    [nodeId, data, setNodes, getNodes, getEdges, upstreamData],
  )

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
      const extra = n.data.type === 'template'
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
    data?.type === "filter" ? !isGenerating :
    data?.type === "template" ? !isGenerating :
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

    // Create a temporary blob URL for immediate playback feedback
    const tempSrc = URL.createObjectURL(file)
    const vid = document.createElement("video")
    vid.preload = "metadata"
    vid.onloadedmetadata = async () => {
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

      // Apply immediately so the user sees the video right away
      handleUpdateRef.current({ videoSrc: tempSrc, fileName: file.name, videoDuration, width: w, height: h })

      // Upload to MinIO in the background → swap to persistent URL
      try {
        const form = new FormData()
        form.append('file', file)
        const res  = await fetch('/api/upload', { method: 'POST', body: form })
        const json = await res.json() as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
        handleUpdateRef.current({ videoSrc: json.url })
        URL.revokeObjectURL(tempSrc)
      } catch (err) {
        console.error('[handleUploadVideo] MinIO upload failed, keeping blob URL:', err)
        // Blob URL still works this session; warn that it won't survive refresh
      }
    }
    vid.src = tempSrc
  }, []) // intentionally no deps — uses handleUpdateRef to avoid stale closure

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
              
              // Handle text/filter/seed node results
              if ((nodeType === "text" || nodeType === "filter" || nodeType === "seed") && nodeResult.content !== undefined) {
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

  // ── Batch generation — job-based, consistent with text nodes ────────────
  /**
   * Flow:
   *  1. POST /api/jobs { nodeType:'batch', batchParams } → jobId
   *  2. Set node.data.isGenerating=true, activeJobId=jobId
   *     (_polling.ts in NodeWrapper starts showing the overlay)
   *  3. Local poll until job.result.stage === 'seeds_ready'
   *  4. Create instances (onLoopAddInstance) and fill seed content  — fast, < 1s
   *  5. POST /api/jobs/[jobId]/continue with instance nodes/edges
   *  6. _polling.ts takes over: tracks workflow progress and applies
   *     instanceResults when job.status === 'done'
   */
  const handleBatchGenerate = useCallback(async (
    prompt: string,
    model:  string,
    params: Record<string, string>,
  ) => {
    if (!node || data?.type !== "template") return

    const maxInstances    = parseInt(params.instanceMax || "3", 10)
    const upstreamContent = upstreamData.map(u => u.content).filter(Boolean).join("\n")

    // ── 1. Signal generating immediately ────────────────────────────────────
    setNodes(ns => ns.map(n =>
      n.id !== nodeId ? n : { ...n, data: { ...n.data, isGenerating: true } }
    ))

    try {
      // ── 2. Create batch job ──────────────────────────────────────────────
      const jobRes = await fetch("/api/jobs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          nodeType:    "template",
          prompt,
          model,
          batchParams: { maxInstances, upstreamContent },
        }),
      })
      const jobJson = await jobRes.json()
      if (!jobRes.ok || jobJson.error) throw new Error(jobJson.error ?? `Server error ${jobRes.status}`)

      const { jobId } = jobJson as { jobId: string }

      // Writing activeJobId activates _polling.ts in NodeWrapper.
      // batchResumeHandled tells _polling that the editor owns seeds_ready handling
      // (stripped from draft by sanitizeNodes, so absent after a page refresh).
      setNodes(ns => ns.map(n =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, activeJobId: jobId, batchResumeHandled: jobId } }
      ))

      // ── 3. Wait for seeds_ready (short local poll, ~2-3s) ───────────────
      const seeds = await waitForBatchSeeds(jobId)
      if (!seeds || seeds.length === 0) throw new Error("No seeds returned")

      // ── 4. Create instances + fill seed content ──────────────────────────
      // All instance creation happens before we notify the backend so that
      // /continue receives the fully-formed nodes/edges in one shot.
      for (let i = 0; i < seeds.length; i++) {
        onLoopAddInstance?.(nodeId)
        await new Promise(r => setTimeout(r, 100)) // let React flush
      }

      // Snapshot nodes/edges after all instances are rendered
      await new Promise(r => setTimeout(r, 100))
      const snapNodes = getNodesRef.current()
      const snapEdges = getEdgesRef.current()

      // Determine instance indices that were just created.
      // onLoopAddInstance increments instanceCount each time; the new
      // indices are (finalCount - seeds.length) … (finalCount - 1).
      const batchNode     = snapNodes.find((n: Node) => n.id === nodeId)
      const finalCount    = batchNode?.data?.instanceCount ?? seeds.length
      const startIdx      = finalCount - seeds.length

      const instances: Array<{
        instanceIdx: number
        nodes: Node[]
        edges: Edge[]
      }> = []

      for (let i = 0; i < seeds.length; i++) {
        const instanceIdx = startIdx + i
        const seed        = seeds[i]

        // Collect this instance's nodes/edges.
        // iEdges: include any edge whose TARGET is an internal node — this
        // captures external→internal connections, not just pure-internal ones.
        let iNodes     = snapNodes.filter((n: Node) =>
          n.data?.loopId === nodeId && n.data?.instanceIdx === instanceIdx
        )
        const iNodeIds = new Set(iNodes.map((n: Node) => n.id))
        const iEdges   = snapEdges.filter((e: Edge) => iNodeIds.has(e.target))

        // Collect external source nodes (source not in iNodeIds) and mark them
        // _preResolved so WorkflowEngine treats them as pre-completed DAG roots
        // (their existing content is used directly, no LLM call).
        const externalSrcIds = new Set(
          iEdges.filter((e: Edge) => !iNodeIds.has(e.source)).map((e: Edge) => e.source)
        )
        const externalNodes = snapNodes
          .filter((n: Node) => externalSrcIds.has(n.id))
          .map((n: Node) => ({ ...n, data: { ...n.data, _preResolved: true } }))

        // ── Fix: inject seed content directly into iNodes (no re-snapshot) ──
        // Earlier instances are hidden on canvas, so getNodes() may omit them.
        // Mutating iNodes in-memory guarantees every instance gets its seed.
        iNodes = iNodes.map((n: Node) =>
          n.data?.type === "seed"
            ? { ...n, data: { ...n.data, content: seed.content } }
            : n
        )

        // Also update canvas UI so the seed chip is visible when viewing that instance
        const seedNode = iNodes.find((n: Node) => n.data?.type === "seed")
        if (seedNode) {
          setNodes(ns => ns.map((n: Node) =>
            n.id !== seedNode.id ? n : { ...n, data: { ...n.data, content: seed.content } }
          ))
        } else {
          console.warn(`[batch] No seed node for instance ${instanceIdx}`)
        }

        // Translation of {{templateNodeId}} → {{instanceNodeId}} in prompts is
        // handled upstream in handleLoopAddInstance (useLoopManager), so iNodes
        // already carry the correct instance-scoped references here.
        // External nodes are appended so the backend DAG can resolve {{ref}}.
        instances.push({ instanceIdx, nodes: [...iNodes, ...externalNodes], edges: iEdges })
      }

      // ── 5. Hand off to backend — /continue takes care of workflows ───────
      const contRes = await fetch(`/api/jobs/${jobId}/continue`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ instances }),
      })
      if (!contRes.ok) {
        const err = await contRes.json()
        throw new Error(err.error ?? `Continue error ${contRes.status}`)
      }

      // _polling.ts handles the rest (executing_workflows → done)

    } catch (err) {
      console.error("[batch] generate failed:", err)
      setNodes(ns => ns.map(n =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
      ))
    }
  }, [node, data?.type, nodeId, upstreamData, onLoopAddInstance, setNodes])

  /** Poll job until stage='seeds_ready', then return seeds array */
  const waitForBatchSeeds = useCallback(async (
    jobId: string,
  ): Promise<Array<{ content: string; description?: string }> | null> => {
    const TIMEOUT = 30_000
    const deadline = Date.now() + TIMEOUT

    // Clear any previous seed poll
    if (batchSeedPollRef.current) clearInterval(batchSeedPollRef.current)

    return new Promise(resolve => {
      batchSeedPollRef.current = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(batchSeedPollRef.current!)
          batchSeedPollRef.current = null
          resolve(null)
          return
        }
        try {
          const res  = await fetch(`/api/jobs/${jobId}`)
          const json = await res.json()

          if (json.status === "failed") {
            clearInterval(batchSeedPollRef.current!)
            batchSeedPollRef.current = null
            resolve(null)
            return
          }

          const seeds = json.result?.seeds
          if (json.result?.stage === "seeds_ready" && Array.isArray(seeds) && seeds.length > 0) {
            clearInterval(batchSeedPollRef.current!)
            batchSeedPollRef.current = null
            resolve(seeds)
          }
          // else: still generating_seeds → keep polling
        } catch {
          // transient network error — keep polling
        }
      }, POLL_INTERVAL_MS)
    })
  }, [])

  const handleStopBatch = useCallback(() => {
    if (batchSeedPollRef.current) {
      clearInterval(batchSeedPollRef.current)
      batchSeedPollRef.current = null
    }
    setNodes(ns => ns.map(n =>
      n.id !== nodeId ? n : { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
    ))
  }, [nodeId, setNodes])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (workflowPollRef.current)    clearInterval(workflowPollRef.current)
      if (batchSeedPollRef.current)   clearInterval(batchSeedPollRef.current)
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

  const isContainerNode    = data.type === 'template'
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
          onFilterModeChange={(m) => handleUpdate({ filterInputMode: m })}
          onLoopRelease={handleLoopReleaseClick}
          onLoopAddInstance={handleLoopAddInstance}
          onLoopDeleteInstance={handleLoopDeleteInstance}
          onLoopGoTo={handleLoopGoTo}
          loopInstanceCount={loopInstanceCount}
          onExecute={handleExecuteWorkflow}
          isExecuting={data?.type === 'template' ? isGenerating : isExecutingWorkflow}
          onLassoRelease={onLassoRelease ? () => onLassoRelease(nodeId) : undefined}
        />
      </div>

      {/* ModeToggle + Panel */}
      {!isLoopInstanceView && data.type !== 'lasso' && (<>
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
          
          // Template uses job-based generation (same isGenerating flag as text nodes)
          const isBatch    = data.type === 'template'
          const isFilter   = data.type === 'filter'
          const generationProps = isBatch ? {
            isGenerating,
            onGenerate: handleBatchGenerate,
            onStop:     handleStopBatch,
          } : isFilter ? {
            isGenerating,
            onGenerate: handleFilterGenerate,
            onStop:     handleStopGenerate,
          } : {
            isGenerating,
            onGenerate: handleStartGenerate,
            onStop:     handleStopGenerate,
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
              Release template?
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