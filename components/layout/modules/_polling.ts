"use client"

import React, { useState, useEffect, useRef, useContext } from 'react'
import { useReactFlow } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import type { TemplateJobResult } from '@/app/services/job.service'
import { MODULE_BY_ID } from './_registry'
import type { ResultHandlerContext } from './_registry'
import { resultHandler as defaultResultHandler } from './text/resultHandler'

const POLL_MS = 1500

// ─────────────────────────────────────────────
// TemplateOrchestratorContext
//
// Provided by canvas.tsx (inside ReactFlowProvider).
// Gives _polling.ts access to onTemplateAddInstance so it can resume a
// seeds_ready template job after a page refresh (when no editor is open).
// ─────────────────────────────────────────────
import type { BatchInstanceResult } from '@/components/layout/canvas/hooks/useTemplateManager'

export interface TemplateOrchestratorFns {
  addInstance: (templateId: string) => void
  addInstances: (templateId: string, count: number, seedContents?: string[]) => BatchInstanceResult | null
}
export const TemplateOrchestratorContext =
  React.createContext<TemplateOrchestratorFns | null>(null)

/**
 * useNodePolling
 *
 * Polls /api/jobs/[activeJobId] while data.isGenerating is true.
 * Lives in NodeWrapper so generation continues independently of the editor.
 *
 * Template-specific resume path:
 *   If polling detects stage='seeds_ready' and the editor is NOT handling
 *   the job (templateResumeHandled !== jobId), it uses TemplateOrchestratorContext
 *   to create instances and POST /continue — resuming after a page refresh.
 *
 * On job completion:
 *  - image nodes:  decodes b64 → uploads to MinIO → updates dimensions
 *  - template nodes:  applies instanceResults to all instance nodes
 *  - all others:   writes result.content to node.data.content
 */
export function useNodePolling(
  nodeId: string | undefined,
  data:   any,
) {
  const { setNodes, getNodes, getEdges } = useReactFlow()
  const [genProgress, setGenProgress]    = useState(0)
  const orchestrator = useContext(TemplateOrchestratorContext)

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

    // Template nodes use real progress — skip fake ticker
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

        // ── Template: update real progress ──────────────────────────────────────
        if (nodeType === 'template' && json.status === 'running') {
          const templateResult = json.result as TemplateJobResult | undefined
          const stage       = templateResult?.stage
          const progress    = templateResult?.workflowProgress

          if (progress && progress.total > 0) {
            setGenProgress(0.05 + (progress.current / progress.total) * 0.85)
          } else if (stage === 'generating_seeds') {
            setGenProgress(0.03)
          } else if (stage === 'seeds_ready') {
            setGenProgress(0.05)
            // ── Resume path (page refresh) ─────────────────────────────────
            // templateResumeHandled is set by the editor when it owns this job.
            // It is stripped from draft by sanitizeNodes, so after a refresh
            // it will be absent — meaning we should resume here.
            const handledByEditor = dataRef.current?.templateResumeHandled === jobId
            const alreadyResuming = resumeRef.current === jobId
            const orch            = orchestratorRef.current
            const seeds           = templateResult?.seeds ?? []

            if (!handledByEditor && !alreadyResuming && orch && seeds.length > 0) {
              resumeRef.current = jobId
              void runTemplateSeedsResume(
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

          // Dispatch to module-specific result handler
          const mod = nodeType ? MODULE_BY_ID[nodeType] : undefined
          const handler = mod?.resultHandler ?? defaultResultHandler
          const handlerCtx: ResultHandlerContext = {
            nodeId,
            setNodes: setNodesRef.current,
            getNodes: getNodesRef.current,
            getEdges: getEdgesRef.current,
          }
          await handler(result, handlerCtx)

          setTimeout(() => setGenProgress(0), 800)

        } else if (json.status === 'failed') {
          clearIntervals()
          setGenProgress(0)
          setNodesRef.current(ns => ns.map(n =>
            n.id !== nodeId ? n : {
              ...n,
              data: {
                ...n.data,
                isGenerating:    false,
                activeJobId:     undefined,
                generationError: json.error ?? 'Generation failed',
              },
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
// runTemplateSeedsResume
//
// Called by _polling when seeds_ready is detected after a page refresh.
// Mirrors handleTemplateGenerate steps 4+5 in node_editor_index.tsx.
// ─────────────────────────────────────────────
async function runTemplateSeedsResume(
  jobId:       string,
  nodeId:      string,
  seeds:       Array<{ content: string; description?: string }>,
  addInstance: (templateId: string) => void,
  setNodesRef: React.MutableRefObject<(fn: (nodes: Node[]) => Node[]) => void>,
  getNodesRef: React.MutableRefObject<() => Node[]>,
  getEdgesRef: React.MutableRefObject<() => Edge[]>,
): Promise<void> {
  try {
    // 1. Create instances (same as onTemplateAddInstance in editor)
    for (let i = 0; i < seeds.length; i++) {
      addInstance(nodeId)
      await new Promise(r => setTimeout(r, 100))
    }

    await new Promise(r => setTimeout(r, 100))
    const snapNodes = getNodesRef.current()
    const snapEdges = getEdgesRef.current()

    const templateNode  = snapNodes.find((n: Node) => n.id === nodeId)
    const finalCount = templateNode?.data?.instanceCount ?? seeds.length
    const startIdx   = finalCount - seeds.length

    const instances: Array<{ instanceIdx: number; nodes: Node[]; edges: Edge[] }> = []

    for (let i = 0; i < seeds.length; i++) {
      const instanceIdx = startIdx + i
      const seed        = seeds[i]

      // Collect this instance's nodes/edges.
      // Instance nodes are tagged with templateId (the template node's ID) and instanceIdx.
      // iEdges: include any edge whose TARGET is an internal node — this
      // captures external→internal connections, not just pure-internal ones.
      let iNodes   = snapNodes.filter((n: Node) =>
        n.data?.templateId === nodeId && n.data?.instanceIdx === instanceIdx
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

      // Inject seed content directly into iNodes (no re-snapshot)
      iNodes = iNodes.map((n: Node) =>
        n.data?.type === 'seed' || n.data?.isSeed
          ? { ...n, data: { ...n.data, content: seed.content } }
          : n
      )

      // Also update canvas UI
      const seedNode = iNodes.find((n: Node) => n.data?.type === 'seed' || n.data?.isSeed)
      if (seedNode) {
        setNodesRef.current(ns => ns.map((n: Node) =>
          n.id !== seedNode.id ? n : { ...n, data: { ...n.data, content: seed.content } }
        ))
      } else {
        console.warn(`[template resume] No seed node found for instance ${instanceIdx} (templateId=${nodeId})`)
      }

      // Translation of {{templateNodeId}} → {{instanceNodeId}} in prompts is
      // handled upstream in handleTemplateAddInstance (useTemplateManager).
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
        console.error('[template resume] /continue failed:', err.error)
      }
    }
  } catch (err) {
    console.error('[template resume] runTemplateSeedsResume failed:', err)
  }
}
