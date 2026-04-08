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
import type { AnyNodeData, CustomNodeData } from "../modules/_types"
import { useUpstreamData } from "@/hooks/useUpstreamData"
import { resolvePromptToMultimodal } from "@/lib/prompt-resolver"
import type { MultimodalContent } from "@/lib/prompt-resolver"

import { NodeActionBar }                          from "./_action_bar"
import { ModeToggle }    from "./_panels"
import type { NodeMode } from "../modules/_types"
import { MODULE_BY_ID }  from "../modules/_registry"
import { TemplateOrchestratorContext } from "../modules/_polling"

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
const WORKFLOW_DONE_CLEANUP_DELAY_MS = 3000

// ─────────────────────────────────────────────
// NodeEditor
// ─────────────────────────────────────────────
export interface NodeEditorProps {
  nodeId: string
  onClose: () => void
  onDelete: (nodeId: string) => void
  // ── Template instance actions (provided by canvas.tsx) ──
  onTemplateAddInstance?: (templateId: string) => void
  onTemplateDeleteInstance?: (templateId: string, instanceIdx: number) => void
  onTemplateSwitchView?: (templateId: string, viewIdx: number) => void
  onTemplateRelease?: (templateId: string) => void
  onLassoRelease?: (lassoId: string) => void
}

export function NodeEditor({
  nodeId,
  onClose,
  onDelete,
  onTemplateAddInstance,
  onTemplateDeleteInstance,
  onTemplateSwitchView,
  onTemplateRelease,
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
  const [mode, setMode] = useState<NodeMode>(() => {
    const rawMode = data?.mode as string | undefined
    return (rawMode === "done" ? "note" : (rawMode ?? "manual")) as NodeMode
  })

  // Sync mode from data when switching to a different node
  const prevNodeIdRef = useRef(nodeId)
  useEffect(() => {
    if (nodeId !== prevNodeIdRef.current) {
      const rawMode = data?.mode as string | undefined
      setMode((rawMode === "done" ? "note" : (rawMode ?? "manual")) as NodeMode)
      prevNodeIdRef.current = nodeId
    }
    // Clear any error when the editor opens for this node
    if (data?.generationError) {
      setNodes(ns => ns.map(n =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, generationError: undefined } }
      ))
    }
  }, [nodeId, data?.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Text-edit mode ───────────────────────────
  const [isTextEditing, setIsTextEditing] = useState(false)

  // ── Generating state — read from node data (polling lives in NodeWrapper) ──
  const isGenerating = !!data?.isGenerating

  // ── Workflow execution state (for lasso) ─────
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false)
  /** 'idle' | 'running' | 'paused' for lasso action-bar three-state */
  const [lassoWorkflowStatus, setLassoWorkflowStatus] = useState<"idle" | "running" | "paused">("idle")
  const workflowEventSourceRef = useRef<EventSource | null>(null)
  const workflowJobRef  = useRef<string | null>(null)
  const workflowTrackedNodeIdsRef = useRef<string[]>([])

  // ── Template seed-ready polling ref ─────────────
  // While seeds are being generated we do a short local poll.
  // Once /continue is POSTed, _polling.ts (NodeWrapper) handles the rest.
  const templateSeedPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    async (prompt: string, model: string, params: Record<string, string>, imageSlotNodeIds?: Record<string, string>) => {
      // Signal generating immediately so the overlay appears
      setNodes((ns) => ns.map((n) =>
        n.id !== nodeId ? n : {
          ...n,
          data: {
            ...n.data,
            isEditing: false,
            isGenerating: true,
            generationProgress: 0,
            generationStatusText: 'Queueing job…',
            generationError: undefined,
          },
        }
      ))

      try {
        // Resolve image slot nodeIds → actual URLs from upstreamData
        let imageSlots: Record<string, string | string[]> | undefined
        if (imageSlotNodeIds && Object.keys(imageSlotNodeIds).length > 0) {
          const upstreamMap = new Map(upstreamData.map((n) => [n.id, n]))
          const resolved: Record<string, string | string[]> = {}
          // Groups indexed slots (e.g. reference_images_0, image_input_0) → baseKey: string[]
          const arrayGroups: Record<string, Array<string | undefined>> = {}

          for (const [key, nid] of Object.entries(imageSlotNodeIds)) {
            if (!nid) continue
            const node = upstreamMap.get(nid)
            if (!node?.src) continue

            const arrayMatch = key.match(/^(.+)_(\d+)$/)
            if (arrayMatch) {
              // Indexed array slot — group by base key (reference_images, image_input, etc.)
              const baseKey = arrayMatch[1]
              const idx     = parseInt(arrayMatch[2], 10)
              if (!arrayGroups[baseKey]) arrayGroups[baseKey] = []
              arrayGroups[baseKey][idx] = node.src
            } else {
              resolved[key] = node.src
            }
          }

          // Collapse sparse arrays into dense string[] entries
          for (const [baseKey, arr] of Object.entries(arrayGroups)) {
            const filtered = arr.filter((u): u is string => !!u)
            if (filtered.length > 0) resolved[baseKey] = filtered
          }

          if (Object.keys(resolved).length > 0) imageSlots = resolved
        }

        const res  = await fetch("/api/jobs", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            nodeId,
            nodeType: data?.type ?? "text",
            prompt,
            model,
            modelParams: params,
            upstreamData,
            ...(imageSlots && { imageSlots }),
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
        const msg = err instanceof Error ? err.message : 'Generation failed'
        setNodes((ns) => ns.map((n) =>
          n.id !== nodeId ? n : {
            ...n,
            data: {
              ...n.data,
              isGenerating: false,
              activeJobId: undefined,
              generationProgress: 0,
              generationStatusText: '',
              generationError: msg,
            },
          }
        ))
      }
    },
    [nodeId, data?.type, setNodes, upstreamData],
  )

  const handleStopGenerate = useCallback(() => {
    setNodes((ns) => ns.map((n) =>
      n.id !== nodeId ? n : {
        ...n,
        data: {
          ...n.data,
          isGenerating: false,
          activeJobId: undefined,
          generationProgress: 0,
          generationStatusText: '',
        },
      }
    ))
  }, [nodeId, setNodes])

  // ── Filter generation — builds full multimodal prompt on the frontend ─────
  // Separates REF edges (condition context) from IN edges (items to classify).
  // Sends pre-built content + filterItems metadata to /api/jobs.
  const handleFilterGenerate = useCallback(
    async (prompt: string, model: string, params: Record<string, string>) => {
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
        n.id !== nodeId ? n : {
          ...n,
          data: {
            ...n.data,
            isEditing: false,
            isGenerating: true,
            generationProgress: 0,
            generationStatusText: 'Queueing job…',
            generationError: undefined,
          },
        }
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
            modelParams: params,
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
        const msg = err instanceof Error ? err.message : 'Generation failed'
        setNodes((ns) => ns.map((n) =>
          n.id !== nodeId ? n : {
            ...n,
            data: {
              ...n.data,
              isGenerating: false,
              activeJobId: undefined,
              generationProgress: 0,
              generationStatusText: '',
              generationError: msg,
            },
          }
        ))
      }
    },
    [nodeId, data, setNodes, getNodes, getEdges, upstreamData],
  )

  // ── File input ref ───────────────────────────
  const uploadInputRef      = useRef<HTMLInputElement>(null)
  const videoUploadInputRef = useRef<HTMLInputElement>(null)
  const pdfUploadInputRef   = useRef<HTMLInputElement>(null)

  // ── Data update helper ───────────────────────
  const handleUpdate = useCallback(
    (updates: Partial<CustomNodeData>) => {
      setNodes((ns) => ns.map((n) => {
        if (n.id !== nodeId) return n
        const next = { ...n, data: { ...n.data, ...updates } }
        if (updates.width !== undefined || updates.height !== undefined) {
          const oldW = (n.style?.width  as number | undefined) ?? n.data.width  ?? 180
          const oldH = (n.style?.height as number | undefined) ?? n.data.height ?? 180
          const newW = updates.width  ?? oldW
          const newH = updates.height ?? oldH
          next.style = {
            ...n.style,
            width:  newW,
            height: newH,
          }
          // Keep bottom-center fixed (instant — animation handled by NodeUI scale trick)
          next.position = {
            x: n.position.x + (oldW - newW) / 2,
            y: n.position.y + (oldH - newH),
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
    handleUpdate({ mode: m, done: m === "note" })
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
    data?.type === "pdf" ? !isGenerating :
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

  const handleFilterReverseToggle = useCallback(() => {
    if (data?.type !== "filter") return
    handleUpdate({ filterReversed: !Boolean(data.filterReversed) })
  }, [data?.type, data?.filterReversed, handleUpdate])

  // ── Template instance controls (flat model) ──────
  const handleTemplateAddInstance = useCallback(() => {
    onTemplateAddInstance?.(nodeId)
  }, [nodeId, onTemplateAddInstance])

  const handleTemplateDeleteInstance = useCallback(() => {
    const idx = data?.currentInstance ?? -1
    if (idx < 0) return
    onTemplateDeleteInstance?.(nodeId, idx)
  }, [nodeId, data?.currentInstance, onTemplateDeleteInstance])

  const handleTemplateGoTo = useCallback((idx: number) => {
    onTemplateSwitchView?.(nodeId, idx)
  }, [nodeId, onTemplateSwitchView])

  // ── Template release with confirmation ───────────
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false)

  const handleTemplateReleaseClick = useCallback(() => {
    const count = data?.instanceCount ?? 0
    if (count > 0) {
      setShowReleaseConfirm(true)
    } else {
      onTemplateRelease?.(nodeId)
    }
  }, [nodeId, data?.instanceCount, onTemplateRelease])

  const handleReleaseConfirm = useCallback(() => {
    setShowReleaseConfirm(false)
    onTemplateRelease?.(nodeId)
  }, [nodeId, onTemplateRelease])

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

  const handleUploadPdf = useCallback((file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith('.pdf')) return

    const tempSrc = URL.createObjectURL(file)
    handleUpdateRef.current({
      pdfSrc: tempSrc,
      fileName: file.name,
      pdfCurrentPage: 1,
      pdfPageCount: undefined,
    })

    ;(async () => {
      try {
        const form = new FormData()
        form.append('file', file)
        const res  = await fetch('/api/upload', { method: 'POST', body: form })
        const json = await res.json() as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed')
        handleUpdateRef.current({ pdfSrc: json.url })
        URL.revokeObjectURL(tempSrc)
      } catch (err) {
        console.error('[handleUploadPdf] MinIO upload failed, keeping blob URL:', err)
      }
    })()
  }, [])

  // ── Download ──────────────────────────────────
  const handleDownload = useCallback(() => {
    const href =
      data?.type === "video"
        ? data.videoSrc
        : data?.type === "pdf"
          ? data.pdfSrc
          : data?.src
    if (!href) return
    const a = document.createElement("a")
    a.href = href
    a.download = data?.fileName || (data?.type === "video" ? "video" : data?.type === "pdf" ? "document.pdf" : "image")
    a.click()
  }, [data?.type, data?.videoSrc, data?.pdfSrc, data?.src, data?.fileName])

  // ─────────────────────────────────────────────
  // applyWorkflowNodeStatuses — shared helper used by both SSE and polling
  // ─────────────────────────────────────────────
  const applyWorkflowNodeStatuses = useCallback((
    nodeStatuses: Record<string, {
      status?: string
      jobId?: string
      error?: string | null
    }>,
    trackedIds: string[],
  ) => {
    setNodes((ns) => ns.map((n) => {
      if (!trackedIds.includes(n.id)) return n

      const status = nodeStatuses[n.id]?.status ?? "queueing_in_workflow"
      const jobId = nodeStatuses[n.id]?.jobId
      const nextData: Record<string, unknown> = { ...n.data }

      if (status === "queueing_in_workflow" || status === "waiting_upstream" || status === "paused") {
        nextData.isGenerating = true
        nextData.generationProgress = 0
        nextData.generationStatusText =
          status === "waiting_upstream" ? "Waiting for upstream…" :
          status === "paused" ? "Paused…" :
          "Queueing in workflow…"
        nextData.activeJobId = undefined
        if (nextData.done !== true) nextData.done = false
        if (!nextData.generationError) nextData.generationError = undefined
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
        if (!nextData.generationError) nextData.generationError = undefined
        return { ...n, data: nextData }
      }

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
        nextData.generationError = nodeStatuses[n.id]?.error ?? "Generation failed"
        return { ...n, data: nextData }
      }

      // Unknown state fallback
      nextData.isGenerating = true
      nextData.generationProgress = 0
      nextData.generationStatusText = "Queueing in workflow…"
      nextData.activeJobId = undefined
      nextData.done = false
      if (!nextData.generationError) nextData.generationError = undefined
      return { ...n, data: nextData }
    }))
  }, [setNodes])

  // ── Lasso workflow — SSE-based execution with pause/resume/stop ───────────

  const stopWorkflowSSE = useCallback(() => {
    if (workflowEventSourceRef.current) {
      workflowEventSourceRef.current.close()
      workflowEventSourceRef.current = null
    }
    workflowJobRef.current = null
    workflowTrackedNodeIdsRef.current = []
    setIsExecutingWorkflow(false)
    setLassoWorkflowStatus("idle")
  }, [])

  const startWorkflowSSE = useCallback((workflowJobId: string, trackedNodeIds: string[]) => {
    workflowJobRef.current = workflowJobId
    workflowTrackedNodeIdsRef.current = trackedNodeIds
    setIsExecutingWorkflow(true)
    setLassoWorkflowStatus("running")

    const es = new EventSource(`/api/execute/workflow/${workflowJobId}/stream`)
    workflowEventSourceRef.current = es

    es.onmessage = (event) => {
      if (workflowJobRef.current !== workflowJobId) { es.close(); return }

      const json = JSON.parse(event.data) as {
        status?: string
        nodeStatuses?: Record<string, { status?: string; jobId?: string; error?: string | null }>
      }

      const nodeStatuses = json.nodeStatuses ?? {}
      applyWorkflowNodeStatuses(nodeStatuses, trackedNodeIds)

      // Update lasso button state
      if (json.status === "paused") {
        setLassoWorkflowStatus("paused")
      } else if (json.status === "running") {
        setLassoWorkflowStatus("running")
      }

      if (json.status === "completed") {
        stopWorkflowSSE()
        setTimeout(() => {
          setNodes((ns) => ns.map((n) => {
            if (!trackedNodeIds.includes(n.id)) return n
            const isNote = n.data?.mode === "note"
            return { ...n, data: { ...n.data, done: isNote ? n.data?.done : false } }
          }))
        }, WORKFLOW_DONE_CLEANUP_DELAY_MS)
      } else if (json.status === "failed" || json.status === "stopped") {
        if (trackedNodeIds.length > 0) {
          setNodes((ns) => ns.map((n) => {
            if (!trackedNodeIds.includes(n.id)) return n
            return {
              ...n,
              data: {
                ...n.data,
                isGenerating: false,
                activeJobId: undefined,
                generationProgress: 0,
                generationStatusText: "",
                done: n.data?.mode === "note" ? n.data?.done : false,
                generationError: nodeStatuses[n.id]?.error ?? n.data?.generationError,
              },
            }
          }))
        }
        stopWorkflowSSE()
      }
    }

    es.onerror = () => {
      console.error("[lasso] SSE stream error")
      es.close()
      stopWorkflowSSE()
    }
  }, [applyWorkflowNodeStatuses, stopWorkflowSSE, setNodes])

  // Lasso pause/resume/stop handlers
  const handleLassoPause = useCallback(async () => {
    const jobId = workflowJobRef.current
    if (!jobId) return
    await fetch(`/api/execute/workflow/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    })
    setLassoWorkflowStatus("paused")
  }, [])

  const handleLassoResume = useCallback(async () => {
    const jobId = workflowJobRef.current
    if (!jobId) return
    await fetch(`/api/execute/workflow/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    })
    setLassoWorkflowStatus("running")
  }, [])

  const handleLassoStop = useCallback(async () => {
    const jobId = workflowJobRef.current
    if (!jobId) return
    await fetch(`/api/execute/workflow/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    })
    stopWorkflowSSE()
    // Restore node states
    const trackedIds = workflowTrackedNodeIdsRef.current
    if (trackedIds.length > 0) {
      setNodes((ns) => ns.map((n) => {
        if (!trackedIds.includes(n.id)) return n
        return {
          ...n,
          data: {
            ...n.data,
            isGenerating: false,
            activeJobId: undefined,
            generationProgress: 0,
            generationStatusText: "",
            done: n.data?.mode === "note" ? n.data?.done : false,
          },
        }
      }))
    }
  }, [stopWorkflowSSE, setNodes])

  // Keep startWorkflowPolling alias for template rerun (which still uses interval poll)
  const startWorkflowPolling = startWorkflowSSE

  const handleTemplateRerunWorkflow = useCallback(async () => {
    if (!node || data?.type !== "template") return
    const currentInstance = data.currentInstance ?? -1
    if (currentInstance < 0) return

    const allNodes = getNodesRef.current()
    const allEdges = getEdgesRef.current()

    const instanceNodes = allNodes.filter((n) =>
      n.data?.templateId === nodeId && n.data?.instanceIdx === currentInstance
    )
    if (instanceNodes.length === 0) return

    const instanceNodeIds = new Set(instanceNodes.map((n) => n.id))
    const instanceEdges = allEdges.filter((e: Edge) => {
      const edgeMeta = e.data as { templateId?: string; instanceIdx?: number } | undefined
      return edgeMeta?.templateId === nodeId && edgeMeta?.instanceIdx === currentInstance
    })

    const externalSourceIds = new Set<string>()
    for (const edge of instanceEdges) {
      if (!instanceNodeIds.has(edge.source)) externalSourceIds.add(edge.source)
    }

    const externalNodes = allNodes
      .filter((n) => externalSourceIds.has(n.id))
      .map((n) => ({ ...n, data: { ...n.data, _preResolved: true } }))

    const workflowNodes = [...instanceNodes, ...externalNodes]
    const workflowNodeIds = instanceNodes.map((n) => n.id)

    // 预置运行态，等待中的节点进度固定为 0
    setNodes((ns) => ns.map((n) => {
      if (!workflowNodeIds.includes(n.id)) return n
      const isNote = n.data?.mode === "note"
      return {
        ...n,
        data: {
          ...n.data,
          isGenerating: true,
          activeJobId: undefined,
          generationProgress: 0,
          generationStatusText: "Queueing in workflow…",
          generationError: undefined,
          done: isNote ? n.data?.done : false,
        },
      }
    }))

    setIsExecutingWorkflow(true)
    try {
      const res = await fetch("/api/execute/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lassoNodeId: nodeId,
          nodes: workflowNodes,
          edges: instanceEdges,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Server error ${res.status}`)
      }

      const { workflowJobId } = await res.json()
      startWorkflowPolling(workflowJobId, workflowNodeIds)
    } catch (err) {
      console.error("[template] rerun workflow failed:", err)
      setNodes((ns) => ns.map((n) => {
        if (!workflowNodeIds.includes(n.id)) return n
        return {
          ...n,
          data: {
            ...n.data,
            isGenerating: false,
            generationProgress: 0,
            activeJobId: undefined,
            generationStatusText: "",
          },
        }
      }))
      setIsExecutingWorkflow(false)
    }
  }, [node, data?.type, data?.currentInstance, nodeId, startWorkflowPolling, setNodes])

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
    const workflowNodeIds = [...childNodeIds]
    const childEdges = edges.filter(
      (e) => childNodeIds.has(e.source) && childNodeIds.has(e.target)
    )

    // 预置运行态，等待中的节点进度固定为 0
    setNodes((ns) => ns.map((n) => {
      if (!childNodeIds.has(n.id)) return n
      const isNote = n.data?.mode === "note"
      return {
        ...n,
        data: {
          ...n.data,
          isGenerating: true,
          activeJobId: undefined,
          generationProgress: 0,
          generationStatusText: "Queueing in workflow…",
          generationError: undefined,
          done: isNote ? n.data?.done : false,
        },
      }
    }))

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
      startWorkflowPolling(workflowJobId, workflowNodeIds)
    } catch (err) {
      console.error("[workflow] execute failed:", err)
      setNodes((ns) => ns.map((n) => {
        if (!childNodeIds.has(n.id)) return n
        return {
          ...n,
          data: {
            ...n.data,
            isGenerating: false,
            generationProgress: 0,
            activeJobId: undefined,
            generationStatusText: "",
          },
        }
      }))
      setIsExecutingWorkflow(false)
    }
  }, [node, data?.type, nodeId, nodes, edges, startWorkflowPolling, setNodes])

  // ── Access batch instance creation via context ────────────────────────────
  const orchestrator = React.useContext(TemplateOrchestratorContext)

  // ── Template generation — job-based ────────────────────────────────────────
  /**
   * Flow:
   *  1. POST /api/jobs { nodeType:'template', templateParams } → jobId
   *  2. Set node.data.isGenerating=true, activeJobId=jobId
   *     (_polling.ts in NodeWrapper starts showing the overlay)
   *  3. Local poll until job.result.stage === 'seeds_ready'
   *  4. Batch-create all instances in ONE state update (handleTemplateAddInstances)
   *     — avoids the race condition of calling addInstance in a loop
   *  5. POST /api/jobs/[jobId]/continue with instance nodes/edges
   *  6. _polling.ts takes over: tracks workflow progress and applies
   *     instanceResults when job.status === 'done'
   */
  const handleTemplateGenerate = useCallback(async (
    prompt: string,
    model:  string,
    params: Record<string, string>,
  ) => {
    if (!node || data?.type !== "template") return

    const maxInstances    = parseInt(params.instanceMax || "3", 10)
    const upstreamContent = upstreamData.map(u => u.content).filter(Boolean).join("\n")

    // ── 1. Signal generating immediately ────────────────────────────────────
    setNodes(ns => ns.map(n =>
      n.id !== nodeId ? n : {
        ...n,
        data: {
          ...n.data,
          isGenerating: true,
          generationProgress: 0,
          generationStatusText: 'Queueing job…',
          generationError: undefined,
        },
      }
    ))

    try {
      // ── 2. Create template job ───────────────────────────────────────────
      const jobRes = await fetch("/api/jobs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          nodeType:    "template",
          prompt,
          model,
          templateParams: { maxInstances, upstreamContent },
        }),
      })
      const jobJson = await jobRes.json()
      if (!jobRes.ok || jobJson.error) throw new Error(jobJson.error ?? `Server error ${jobRes.status}`)

      const { jobId } = jobJson as { jobId: string }

      // Writing activeJobId activates _polling.ts in NodeWrapper.
      // templateResumeHandled tells _polling that the editor owns seeds_ready handling.
      setNodes(ns => ns.map(n =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, activeJobId: jobId, templateResumeHandled: jobId } }
      ))

      // ── 3. Wait for seeds_ready (short local poll, ~2-3s) ───────────────
      const seeds = await waitForTemplateSeeds(jobId)
      if (!seeds || seeds.length === 0) throw new Error("No seeds returned")

      // Persist real instance count as soon as JSON is known,
      // before instance nodes are materialized.
      setNodes(ns => ns.map(n =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, templateResolvedInstanceCount: seeds.length } }
      ))

      // ── 4. Batch-create all instances in a single state update ───────────
      // This is the critical fix: handleTemplateAddInstances creates ALL
      // instances atomically, with seed content injected and external nodes
      // pre-resolved. No loop, no race condition.
      const seedContents = seeds.map(s => s.content)
      const batchResult = orchestrator?.addInstances(nodeId, seeds.length, seedContents)

      if (!batchResult || batchResult.instances.length === 0) {
        throw new Error("Failed to create template instances")
      }

      // ── 5. Hand off to backend — /continue takes care of workflows ───────
      const instances = batchResult.instances.map(inst => ({
        instanceIdx: inst.instanceIdx,
        nodes: inst.nodes.map(n => ({ id: n.id, type: n.type, data: n.data })),
        edges: inst.edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          ...(e.targetHandle && { targetHandle: e.targetHandle }),
        })),
      }))

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
      console.error("[template] generate failed:", err)
      setNodes(ns => ns.map(n =>
        n.id !== nodeId ? n : {
          ...n,
          data: {
            ...n.data,
            isGenerating: false,
            activeJobId: undefined,
            generationProgress: 0,
            generationStatusText: "",
          },
        }
      ))
    }
  }, [node, data?.type, nodeId, upstreamData, orchestrator, setNodes])

  /** Poll job until stage='seeds_ready', then return seeds array */
  async function waitForTemplateSeeds(
    jobId: string,
  ): Promise<Array<{ content: string; description?: string }> | null> {
    const TIMEOUT = 30_000
    const deadline = Date.now() + TIMEOUT

    // Clear any previous seed poll
    if (templateSeedPollRef.current) clearInterval(templateSeedPollRef.current)

    return new Promise(resolve => {
      templateSeedPollRef.current = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(templateSeedPollRef.current!)
          templateSeedPollRef.current = null
          resolve(null)
          return
        }
        try {
          const res  = await fetch(`/api/jobs/${jobId}`)
          const json = await res.json()

          if (json.status === "failed") {
            clearInterval(templateSeedPollRef.current!)
            templateSeedPollRef.current = null
            resolve(null)
            return
          }

          const seeds = json.result?.seeds
          if (json.result?.stage === "seeds_ready" && Array.isArray(seeds) && seeds.length > 0) {
            clearInterval(templateSeedPollRef.current!)
            templateSeedPollRef.current = null
            resolve(seeds)
          }
          // else: still generating_seeds → keep polling
        } catch {
          // transient network error — keep polling
        }
      }, POLL_INTERVAL_MS)
    })
  }

  const handleStopTemplate = useCallback(() => {
    if (templateSeedPollRef.current) {
      clearInterval(templateSeedPollRef.current)
      templateSeedPollRef.current = null
    }
    setNodes(ns => ns.map(n =>
      n.id !== nodeId ? n : {
        ...n,
        data: {
          ...n.data,
          isGenerating: false,
          activeJobId: undefined,
          generationProgress: 0,
          generationStatusText: '',
        },
      }
    ))
  }, [nodeId, setNodes])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Close SSE stream if open
      if (workflowEventSourceRef.current) {
        workflowEventSourceRef.current.close()
        workflowEventSourceRef.current = null
      }
      if (templateSeedPollRef.current) clearInterval(templateSeedPollRef.current)
    }
  }, [])

  if (!node || !data) return null

  // ── Screen coordinates ────────────────────────
  // Read dimensions from: style > data > default
  const absPos  = (node as Node<CustomNodeData> & { positionAbsolute?: { x: number; y: number } }).positionAbsolute ?? node.position
  const actualW = (node.style?.width  as number | undefined) ?? data?.width  ?? DEFAULT_NODE_W
  const actualH = (node.style?.height as number | undefined) ?? data?.height ?? DEFAULT_NODE_H
  const screenX = absPos.x * zoom + tx
  const screenY = absPos.y * zoom + ty
  const nodeW   = actualW * zoom
  const nodeH   = actualH * zoom
  const centerX = screenX + nodeW / 2

  // inlineOffset is applied via translateY so top stays transition-free (no pan lag).
  const hasInline       = !!(data.showPromptInline && data.prompt?.trim())
  const inlineOffset    = hasInline ? Math.round(26 * zoom) : 0
  const actionBarBottom = screenY - ACTION_BAR_GAP
  const barTop          = screenY + nodeH + BAR_GAP
  const panelTop        = barTop + 62 + BAR_PANEL_GAP

  const isContainerNode    = data.type === 'template'
  const templateInstanceCount  = isContainerNode ? (data.instanceCount ?? 0) : 0
  const isTemplateInstanceView = isContainerNode && (data.currentInstance ?? -1) >= 0

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
      <input
        ref={pdfUploadInputRef}
        type="file" accept="application/pdf,.pdf" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleUploadPdf(f)
          e.target.value = ""
        }}
      />

      {/* NodeActionBar */}
      <div
        className="absolute z-[500] pointer-events-auto"
        style={{
          left: centerX, top: actionBarBottom,
          width: "max-content",
          transform: "translate(-50%, -100%)",
          pointerEvents: isGenerating ? "none" : "auto",
          opacity:       isGenerating ? 0.35 : 1,
        }}
      >
        <NodeActionBar
          data={data}
          isTextEditing={isTextEditing}
          onToggleTextEdit={handleToggleTextEdit}
          onUpload={() => {
            if (data.type === "video") {
              videoUploadInputRef.current?.click()
              return
            }
            if (data.type === "pdf") {
              pdfUploadInputRef.current?.click()
              return
            }
            uploadInputRef.current?.click()
          }}
          onDownload={handleDownload}
          onDelete={handleDeleteNode}
          onFilterModeChange={(m) => handleUpdate({ filterInputMode: m })}
          onFilterReverseToggle={data?.type === 'filter' ? handleFilterReverseToggle : undefined}
          onTemplateRelease={handleTemplateReleaseClick}
          onTemplateAddInstance={handleTemplateAddInstance}
          onTemplateDeleteInstance={handleTemplateDeleteInstance}
          onTemplateGoTo={handleTemplateGoTo}
          onTemplateRerunWorkflow={handleTemplateRerunWorkflow}
          templateInstanceCount={templateInstanceCount}
          onExecute={handleExecuteWorkflow}
          onLassoPause={data?.type === 'lasso' ? handleLassoPause : undefined}
          onLassoResume={data?.type === 'lasso' ? handleLassoResume : undefined}
          onLassoStop={data?.type === 'lasso' ? handleLassoStop : undefined}
          workflowStatus={data?.type === 'lasso' ? lassoWorkflowStatus : undefined}
          isExecuting={data?.type === 'template' ? (isGenerating || isExecutingWorkflow) : isExecutingWorkflow}
          onLassoRelease={onLassoRelease ? () => onLassoRelease(nodeId) : undefined}
          onLassoDelete={data?.type === 'lasso' ? handleDeleteNode : undefined}
          onToggleInlinePreview={() => handleUpdate({ showPromptInline: !data.showPromptInline })}
          inlinePreviewEnabled={!!data.showPromptInline}
          onPdfPrevPage={data?.type === "pdf" ? () => {
            const total = Math.max(data.pdfPageCount ?? 1, 1)
            const next = Math.max(1, Math.min(total, (data.pdfCurrentPage ?? 1) - 1))
            handleUpdate({ pdfCurrentPage: next })
          } : undefined}
          onPdfNextPage={data?.type === "pdf" ? () => {
            const total = Math.max(data.pdfPageCount ?? 1, 1)
            const next = Math.max(1, Math.min(total, (data.pdfCurrentPage ?? 1) + 1))
            handleUpdate({ pdfCurrentPage: next })
          } : undefined}
          onPdfSetPage={data?.type === "pdf" ? (page: number) => {
            const total = Math.max(data.pdfPageCount ?? 1, 1)
            const next = Math.max(1, Math.min(total, Math.round(page)))
            handleUpdate({ pdfCurrentPage: next })
          } : undefined}
          onPdfSetPreviewDpi={data?.type === "pdf" ? (dpi: number) => {
            const safe = Math.max(72, Math.min(600, Math.round(dpi)))
            handleUpdate({ pdfPreviewDpi: safe })
          } : undefined}
          onRotate={data?.type === "image" ? () => {
            // Rotate 90 degrees clockwise and swap dimensions to maintain aspect ratio
            const currentRotation = data?.rotation ?? 0
            const newRotation = (currentRotation + 90) % 360
            // Prefer live node style dimensions (React Flow source of truth),
            // then fallback to persisted data/default.
            const currentWidth = (node?.style?.width as number | undefined) ?? data?.width ?? 180
            const currentHeight = (node?.style?.height as number | undefined) ?? data?.height ?? 180
            // 90° step rotation should always swap width/height.
            // Using absolute angle (90/270) breaks after multiple rotates
            // because currentWidth/currentHeight already reflect prior swaps.
            const newWidth = currentHeight
            const newHeight = currentWidth
            handleUpdate({ 
              rotation: newRotation,
              width: newWidth,
              height: newHeight,
            })
          } : undefined}
        />
      </div>

      {/* ModeToggle + Panel */}
      {!isTemplateInstanceView && data.type !== 'lasso' && data.type !== 'seed' && (<>
      <div
        className="absolute z-[500] pointer-events-auto"
        style={{
          left: centerX - PANEL_W / 2, top: barTop, width: PANEL_W,
          display: "flex", justifyContent: "center",
          pointerEvents: isGenerating ? "none" : "auto",
          opacity:       isGenerating ? 0.35 : 1,
          transform:     `translateY(${inlineOffset}px)`,
          transition:    "opacity 200ms ease, transform 200ms ease",
        }}
      >
        <ModeToggle mode={mode} onChange={handleModeChange} />
      </div>

      <div
        className="absolute z-[500] pointer-events-auto bg-white/50 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/50 overflow-hidden"
        style={{ left: centerX - PANEL_W / 2, top: panelTop, width: PANEL_W, transform: `translateY(${inlineOffset}px)`, transition: "transform 200ms ease" }}
      >
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-slate-100">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {mode === 'note' ? 'Note' : (MODULE_BY_ID[data.type]?.meta.panelTitle ?? data.type)}
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
          const isTemplate    = data.type === 'template'
          const isFilter   = data.type === 'filter'
          const generationProps = isTemplate ? {
            isGenerating,
            onGenerate: handleTemplateGenerate,
            onStop:     handleStopTemplate,
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
              data={data as AnyNodeData}
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
            className="bg-white/50 backdrop-blur-md rounded-xl border border-slate-200/50 p-4 min-w-[300px]"
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-300/80 transition-colors"
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