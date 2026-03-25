"use client"

import React, { useState, useEffect, useRef, useContext } from 'react'
import { useReactFlow } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import type { BatchJobResult } from '@/app/services/job.service'

const POLL_MS = 1500

// ─────────────────────────────────────────────
// BatchOrchestratorContext
//
// Provided by canvas.tsx (inside ReactFlowProvider).
// Gives _polling.ts access to onLoopAddInstance so it can resume a
// seeds_ready batch job after a page refresh (when no editor is open).
// ─────────────────────────────────────────────
export interface BatchOrchestratorFns {
  addInstance: (loopId: string) => void
}
export const BatchOrchestratorContext =
  React.createContext<BatchOrchestratorFns | null>(null)

/**
 * useNodePolling
 *
 * Polls /api/jobs/[activeJobId] while data.isGenerating is true.
 * Lives in NodeWrapper so generation continues independently of the editor.
 *
 * Batch-specific resume path:
 *   If polling detects stage='seeds_ready' and the editor is NOT handling
 *   the job (batchResumeHandled !== jobId), it uses BatchOrchestratorContext
 *   to create instances and POST /continue — resuming after a page refresh.
 *
 * On job completion:
 *  - image nodes:  decodes b64 → uploads to MinIO → updates dimensions
 *  - batch nodes:  applies instanceResults to all instance nodes
 *  - all others:   writes result.content to node.data.content
 */
export function useNodePolling(
  nodeId: string | undefined,
  data:   any,
) {
  const { setNodes, getNodes, getEdges } = useReactFlow()
  const [genProgress, setGenProgress]    = useState(0)
  const orchestrator = useContext(BatchOrchestratorContext)

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeJobRef = useRef<string | null>(null)
  // Tracks the jobId currently being resumed by this hook (prevents double-trigger)
  const resumeRef    = useRef<string | null>(null)

  // Stable refs so async callbacks always see the latest values
  const setNodesRef      = useRef(setNodes);      setNodesRef.current      = setNodes
  const getNodesRef      = useRef(getNodes);      getNodesRef.current      = getNodes
  const getEdgesRef      = useRef(getEdges);      getEdgesRef.current      = getEdges
  const dataRef          = useRef(data);          dataRef.current          = data
  const orchestratorRef  = useRef(orchestrator);  orchestratorRef.current  = orchestrator

  const clearIntervals = () => {
    if (pollRef.current)     { clearInterval(pollRef.current);     pollRef.current     = null }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null }
    activeJobRef.current = null
  }

  useEffect(() => {
    const jobId      = data?.activeJobId  as string  | undefined
    const generating = data?.isGenerating as boolean | undefined
    const nodeType   = data?.type         as string  | undefined

    if (!generating) {
      clearIntervals()
      setGenProgress(0)
      return
    }

    if (!jobId || !nodeId) return
    if (activeJobRef.current === jobId) return

    // New job — start fresh
    clearIntervals()
    activeJobRef.current = jobId

    // Batch nodes use real progress — skip fake ticker
    if (nodeType !== 'template') {
      progressRef.current = setInterval(() => {
        setGenProgress(p => Math.min(p + 0.006 + Math.random() * 0.006, 0.9))
      }, 50)
    }

    pollRef.current = setInterval(async () => {
      if (activeJobRef.current !== jobId) return

      try {
        const res     = await fetch(`/api/jobs/${jobId}`)
        const rawText = await res.text()
        let json: any
        try { json = JSON.parse(rawText) } catch { return }

        // ── Batch: update real progress ──────────────────────────────────────
        if (nodeType === 'template' && json.status === 'running') {
          const batchResult = json.result as BatchJobResult | undefined
          const stage       = batchResult?.stage
          const progress    = batchResult?.workflowProgress

          if (progress && progress.total > 0) {
            setGenProgress(0.05 + (progress.current / progress.total) * 0.85)
          } else if (stage === 'generating_seeds') {
            setGenProgress(0.03)
          } else if (stage === 'seeds_ready') {
            setGenProgress(0.05)
            // ── Resume path (page refresh) ─────────────────────────────────
            // batchResumeHandled is set by the editor when it owns this job.
            // It is stripped from draft by sanitizeNodes, so after a refresh
            // it will be absent — meaning we should resume here.
            const handledByEditor = dataRef.current?.batchResumeHandled === jobId
            const alreadyResuming = resumeRef.current === jobId
            const orch            = orchestratorRef.current
            const seeds           = batchResult?.seeds ?? []

            if (!handledByEditor && !alreadyResuming && orch && seeds.length > 0) {
              resumeRef.current = jobId
              void runBatchSeedsResume(
                jobId, nodeId, seeds, orch.addInstance,
                setNodesRef, getNodesRef, getEdgesRef,
              )
            }
          }
          return
        }

        // ── Job done ─────────────────────────────────────────────────────────
        if (json.status === 'done') {
          clearIntervals()
          setGenProgress(1)

          const result = json.result as Record<string, any>

          // Batch: apply instanceResults
          if (nodeType === 'template') {
            const batchResult     = result as BatchJobResult
            const instanceResults = (batchResult.instanceResults ?? {}) as Record<string, any>

            setNodesRef.current(ns => ns.map(n => {
              if (n.id === nodeId) {
                return { ...n, data: { ...n.data, isGenerating: false, activeJobId: undefined } }
              }
              const nodeResult = instanceResults[n.id]
              if (!nodeResult) return n
              if ('content' in nodeResult) {
                return { ...n, data: { ...n.data, content: nodeResult.content, isGenerating: false } }
              }
              return n
            }))
            setTimeout(() => setGenProgress(0), 800)
            return
          }

          // Image: decode b64 → MinIO → update dimensions
          if (nodeType === 'image') {
            const mime   = result.mime || 'image/png'
            const binary = atob(result.b64)
            const ab     = new ArrayBuffer(binary.length)
            const ia     = new Uint8Array(ab)
            for (let i = 0; i < binary.length; i++) ia[i] = binary.charCodeAt(i)
            const blob = new Blob([ab], { type: mime })

            let src: string
            try {
              const form = new FormData()
              form.append(
                'file',
                new File([blob], `generated.${mime.split('/')[1] || 'png'}`, { type: mime }),
              )
              const upRes  = await fetch('/api/upload', { method: 'POST', body: form })
              const upJson = await upRes.json()
              if (!upRes.ok || !upJson.url) throw new Error('upload failed')
              src = upJson.url as string
            } catch {
              src = URL.createObjectURL(blob)
            }

            const img = new window.Image()
            img.src   = src
            await new Promise<void>(resolve => { img.onload = () => resolve() })

            const nw    = img.naturalWidth
            const nh    = img.naturalHeight
            const scale = 180 / Math.min(nw, nh)
            const w     = Math.round(nw * scale)
            const h     = Math.round(nh * scale)

            setNodesRef.current(ns => ns.map(n => {
              if (n.id !== nodeId) return n
              return {
                ...n,
                style: { ...n.style, width: w, height: h },
                data:  {
                  ...n.data,
                  src,
                  naturalWidth:  nw,
                  naturalHeight: nh,
                  width:         w,
                  height:        h,
                  isGenerating:  false,
                  activeJobId:   undefined,
                },
              }
            }))
          } else if (nodeType === 'filter') {
            const filterResult = result.filterResult as {
              passed:   Array<{ id: string; label?: string; type?: string }>
              filtered: Array<{ id: string; label?: string; type?: string }>
              reply?:   string
            } | undefined

            // Compute output content = joined content of passed nodes
            // This is what downstream nodes see when they reference {{filterId}}
            const currentNodes = getNodesRef.current()
            const passedContent = (filterResult?.passed ?? [])
              .map((item) => {
                const n = currentNodes.find((node) => node.id === item.id)
                if (!n) return ''
                const d = n.data as any
                return d?.content || d?.src || d?.videoSrc || ''
              })
              .filter(Boolean)
              .join('\n\n')

            setNodesRef.current(ns => ns.map(n =>
              n.id !== nodeId ? n : {
                ...n,
                data: {
                  ...n.data,
                  content:      passedContent,
                  filterResult,
                  isGenerating: false,
                  activeJobId:  undefined,
                },
              }
            ))
          } else {
            // Text / seed / etc.
            setNodesRef.current(ns => ns.map(n =>
              n.id !== nodeId ? n : {
                ...n,
                data: {
                  ...n.data,
                  content:      result.content,
                  isGenerating: false,
                  activeJobId:  undefined,
                },
              }
            ))
          }

          setTimeout(() => setGenProgress(0), 800)

        } else if (json.status === 'failed') {
          clearIntervals()
          setGenProgress(0)
          setNodesRef.current(ns => ns.map(n =>
            n.id !== nodeId ? n : {
              ...n,
              data: { ...n.data, isGenerating: false, activeJobId: undefined },
            }
          ))
        }
        // 'pending' | 'running' → keep polling
      } catch {
        // Network error — keep polling (transient)
      }
    }, POLL_MS)
  }, [data?.activeJobId, data?.isGenerating, nodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearIntervals() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { genProgress }
}

// ─────────────────────────────────────────────
// runBatchSeedsResume
//
// Called by _polling when seeds_ready is detected after a page refresh.
// Mirrors handleBatchGenerate steps 4+5 in node_editor_index.tsx.
// ─────────────────────────────────────────────
async function runBatchSeedsResume(
  jobId:       string,
  nodeId:      string,
  seeds:       Array<{ content: string; description?: string }>,
  addInstance: (loopId: string) => void,
  setNodesRef: React.MutableRefObject<(fn: (nodes: Node[]) => Node[]) => void>,
  getNodesRef: React.MutableRefObject<() => Node[]>,
  getEdgesRef: React.MutableRefObject<() => Edge[]>,
): Promise<void> {
  try {
    // 1. Create instances (same as onLoopAddInstance loop in editor)
    for (let i = 0; i < seeds.length; i++) {
      addInstance(nodeId)
      await new Promise(r => setTimeout(r, 100))
    }

    await new Promise(r => setTimeout(r, 100))
    const snapNodes = getNodesRef.current()
    const snapEdges = getEdgesRef.current()

    const batchNode  = snapNodes.find((n: Node) => n.id === nodeId)
    const finalCount = batchNode?.data?.instanceCount ?? seeds.length
    const startIdx   = finalCount - seeds.length

    const instances: Array<{ instanceIdx: number; nodes: Node[]; edges: Edge[] }> = []

    for (let i = 0; i < seeds.length; i++) {
      const instanceIdx = startIdx + i
      const seed        = seeds[i]

      // Collect this instance's nodes/edges.
      // iEdges: include any edge whose TARGET is an internal node — this
      // captures external→internal connections, not just pure-internal ones.
      let iNodes   = snapNodes.filter((n: Node) =>
        n.data?.loopId === nodeId && n.data?.instanceIdx === instanceIdx
      )
      const iNodeIds = new Set(iNodes.map((n: Node) => n.id))
      const iEdges   = snapEdges.filter((e: Edge) => iNodeIds.has(e.target))

      // Collect external source nodes and mark them _preResolved so
      // WorkflowEngine treats them as pre-completed DAG roots.
      const externalSrcIds = new Set(
        iEdges.filter((e: Edge) => !iNodeIds.has(e.source)).map((e: Edge) => e.source)
      )
      const externalNodes = snapNodes
        .filter((n: Node) => externalSrcIds.has(n.id))
        .map((n: Node) => ({ ...n, data: { ...n.data, _preResolved: true } }))

      // ── Fix: inject seed content directly into iNodes (no re-snapshot) ──
      iNodes = iNodes.map((n: Node) =>
        n.data?.type === 'seed'
          ? { ...n, data: { ...n.data, content: seed.content } }
          : n
      )

      // Also update canvas UI
      const seedNode = iNodes.find((n: Node) => n.data?.type === 'seed')
      if (seedNode) {
        setNodesRef.current(ns => ns.map((n: Node) =>
          n.id !== seedNode.id ? n : { ...n, data: { ...n.data, content: seed.content } }
        ))
      } else {
        console.warn(`[batch resume] No seed node for instance ${instanceIdx}`)
      }

      // Translation of {{templateNodeId}} → {{instanceNodeId}} in prompts is
      // handled upstream in handleLoopAddInstance (useLoopManager).
      // External nodes are appended so the backend DAG can resolve {{ref}}.
      instances.push({ instanceIdx, nodes: [...iNodes, ...externalNodes], edges: iEdges })
    }

    // 2. POST /continue — backend executes workflows
    const contRes = await fetch(`/api/jobs/${jobId}/continue`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ instances }),
    })

    if (!contRes.ok) {
      const err = await contRes.json()
      // 400 "wrong stage" means editor already handled it — not an error
      if (contRes.status !== 400) {
        console.error('[batch resume] /continue failed:', err.error)
      }
    }
  } catch (err) {
    console.error('[batch resume] runBatchSeedsResume failed:', err)
  }
}
