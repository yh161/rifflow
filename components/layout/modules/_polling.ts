"use client"

import React, { useState, useEffect, useRef, useContext } from 'react'
import { useReactFlow } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import type { TemplateJobResult } from '@/app/services/job.service'
import type { AnyNodeData } from './_types'
import { MODULE_BY_ID } from './_registry'
import type { ResultHandlerContext } from './_registry'
import { resultHandler as defaultResultHandler } from './text/resultHandler'

const POLL_MS = 1500

type ProgressProfile = {
  /** asymptotic cap before backend confirms done */
  max: number
  /** base easing rate per tick (higher = faster) */
  ease: number
}

// Model-specific pacing (easy for you to tune later)
const MODEL_PROGRESS_PROFILE: Record<string, ProgressProfile> = {
  "gemini-2.5-flash": { max: 0.95, ease: 0.028 },
  "gemini-3.1-pro":   { max: 0.94, ease: 0.022 },
  "claude-opus-4.6":  { max: 0.93, ease: 0.02 },
  "gpt-5.2":          { max: 0.93, ease: 0.02 },
  "deepseek-v3":      { max: 0.94, ease: 0.024 },
  "qwen3-32b":        { max: 0.94, ease: 0.023 },
  "llama-3.3-70b":    { max: 0.92, ease: 0.018 },
  "llama-3.1-8b":     { max: 0.94, ease: 0.022 },

  "nano-banana":      { max: 0.92, ease: 0.06 },
  "nano-banana-pro":  { max: 0.9,  ease: 0.05 },
  "grok-video":       { max: 0.88, ease: 0.032 },
}

const NODETYPE_DEFAULT_PROFILE: Record<string, ProgressProfile> = {
  text:   { max: 0.94, ease: 0.024 },
  image:  { max: 0.91, ease: 0.018 },
  video:  { max: 0.88, ease: 0.012 },
  pdf:    { max: 0.93, ease: 0.022 },
  filter: { max: 0.94, ease: 0.024 },
}

function getProgressProfile(nodeType?: string, modelId?: string): ProgressProfile {
  if (modelId && MODEL_PROGRESS_PROFILE[modelId]) return MODEL_PROGRESS_PROFILE[modelId]
  if (nodeType && NODETYPE_DEFAULT_PROFILE[nodeType]) return NODETYPE_DEFAULT_PROFILE[nodeType]
  return { max: 0.93, ease: 0.022 }
}

function getJobStatusText(nodeType: string | undefined, status: string | undefined, result: unknown): string {
  const resultObj = (result && typeof result === 'object') ? (result as Record<string, unknown>) : undefined
  const stage = typeof resultObj?.stage === 'string' ? resultObj.stage : undefined

  if (status === 'pending') return 'Queueing job…'
  if (status === 'failed') return 'Generation failed'
  if (status === 'done') return 'Finishing…'

  if (nodeType === 'template') {
    if (stage === 'generating_seeds') return 'Generating template seeds…'
    if (stage === 'seeds_ready') return 'Applying seeds to instances…'
    if (stage === 'executing_workflows') {
      const workflowProgress = (resultObj?.workflowProgress && typeof resultObj.workflowProgress === 'object')
        ? (resultObj.workflowProgress as Record<string, unknown>)
        : undefined
      const current = typeof workflowProgress?.current === 'number' ? workflowProgress.current : 0
      const total = typeof workflowProgress?.total === 'number' ? workflowProgress.total : 0
      return total > 0
        ? `Executing workflows ${Math.min(current, total)}/${total}…`
        : 'Executing workflows…'
    }
    if (stage === 'done') return 'Completing template job…'
  }

  if (stage === 'fetching_api') return 'Fetching API…'
  if (stage === 'uploading_asset') return 'Uploading result…'
  if (stage === 'processing_result') return 'Processing result…'

  return status === 'running' ? 'Fetching API…' : 'Preparing job…'
}

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
  data:   AnyNodeData | undefined,
) {
  const { setNodes, getNodes, getEdges } = useReactFlow()
  const [genProgress, setGenProgress]    = useState(0)
  const [genStatusText, setGenStatusText] = useState('Preparing job…')
  const orchestrator = useContext(TemplateOrchestratorContext)

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const doneResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideProgressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeJobRef = useRef<string | null>(null)
  // Tracks the jobId currently being resumed by this hook (prevents double-trigger)
  const resumeRef    = useRef<string | null>(null)

  // Stable refs so async callbacks always see the latest values
  const setNodesRef      = useRef(setNodes)
  const getNodesRef      = useRef(getNodes)
  const getEdgesRef      = useRef(getEdges)
  const dataRef          = useRef(data)
  const orchestratorRef  = useRef(orchestrator)
  const statusTextRef    = useRef(genStatusText)
  const progressValueRef = useRef(genProgress)

  useEffect(() => {
    setNodesRef.current = setNodes
    getNodesRef.current = getNodes
    getEdgesRef.current = getEdges
    dataRef.current = data
    orchestratorRef.current = orchestrator
    statusTextRef.current = genStatusText
  }, [setNodes, getNodes, getEdges, data, orchestrator, genStatusText])

  useEffect(() => {
    progressValueRef.current = genProgress
  }, [genProgress])

  useEffect(() => {
    if (!data?.isGenerating) return
    // Keep ticker baseline aligned with persisted progress without causing
    // additional React state writes during render lifecycle.
    progressValueRef.current =
      typeof data?.generationProgress === 'number' ? data.generationProgress : 0
  }, [data?.generationProgress, data?.isGenerating])

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

      if (doneResetRef.current) return

      if (statusTextRef.current) {
        if (hideProgressRef.current) clearTimeout(hideProgressRef.current)
        queueMicrotask(() => setGenStatusText(''))
        hideProgressRef.current = setTimeout(() => {
          progressValueRef.current = 0
          setGenProgress(0)
          hideProgressRef.current = null
        }, 240)
      } else {
        progressValueRef.current = 0
        queueMicrotask(() => setGenProgress(0))
      }
      return
    }

    if (!jobId || !nodeId) return
    if (activeJobRef.current === jobId) return

    // New job — start fresh
    clearIntervals()
    activeJobRef.current = jobId
    const initialProgress = typeof data?.generationProgress === 'number' ? data.generationProgress : 0
    const initialStatus = typeof data?.generationStatusText === 'string' && data.generationStatusText
      ? data.generationStatusText
      : 'Queueing job…'
    progressValueRef.current = initialProgress
    queueMicrotask(() => {
      setGenProgress(initialProgress)
      setGenStatusText(initialStatus)
    })

    // Template nodes use real progress — skip fake ticker
    if (nodeType !== 'template') {
      const modelId = data?.model as string | undefined
      const profile = getProgressProfile(nodeType, modelId)
      progressRef.current = setInterval(() => {
        // Rabbit–tortoise style asymptotic movement:
        // progress += (max - progress) * ease
        const p = progressValueRef.current
        const remaining = Math.max(profile.max - p, 0)
        const next = p + remaining * profile.ease
        const finalProgress = Math.min(next, profile.max)
        progressValueRef.current = finalProgress
        setGenProgress(finalProgress)
      }, 50)
    }

    pollRef.current = setInterval(async () => {
      if (activeJobRef.current !== jobId) return

      try {
        const res     = await fetch(`/api/jobs/${jobId}`)
        const rawText = await res.text()
        let json: { status?: string; result?: unknown; error?: string } | null = null
        try { json = JSON.parse(rawText) } catch { return }
        if (!json) return

        const nextStatusText = getJobStatusText(nodeType, json.status, json.result)
        setGenStatusText(nextStatusText)
        setNodesRef.current(ns => ns.map(n => {
          if (n.id !== nodeId) return n
          const prevProgress = typeof n.data?.generationProgress === 'number' ? n.data.generationProgress : 0
          const prevStatus = typeof n.data?.generationStatusText === 'string' ? n.data.generationStatusText : ''
          const nextProgress = progressValueRef.current
          if (Math.abs(prevProgress - nextProgress) < 0.015 && prevStatus === nextStatusText) return n
          return {
            ...n,
            data: {
              ...n.data,
              generationProgress: nextProgress,
              generationStatusText: nextStatusText,
            },
          }
        }))

        // ── Template: update real progress ──────────────────────────────────────
        if (nodeType === 'template' && json.status === 'running') {
          const templateResult = json.result as TemplateJobResult | undefined
          const stage       = templateResult?.stage
          const progress    = templateResult?.workflowProgress

          if (progress && progress.total > 0) {
            const nextProgress = 0.05 + (progress.current / progress.total) * 0.85
            progressValueRef.current = nextProgress
            setGenProgress(nextProgress)
            setNodesRef.current(ns => ns.map(n =>
              n.id !== nodeId ? n : {
                ...n,
                data: {
                  ...n.data,
                  generationProgress: nextProgress,
                  generationStatusText: nextStatusText,
                },
              }
            ))
          } else if (stage === 'generating_seeds') {
            progressValueRef.current = 0.03
            setGenProgress(0.03)
            setNodesRef.current(ns => ns.map(n =>
              n.id !== nodeId ? n : {
                ...n,
                data: {
                  ...n.data,
                  generationProgress: 0.03,
                  generationStatusText: nextStatusText,
                },
              }
            ))
          } else if (stage === 'seeds_ready') {
            progressValueRef.current = 0.05
            setGenProgress(0.05)
            setNodesRef.current(ns => ns.map(n =>
              n.id !== nodeId ? n : {
                ...n,
                data: {
                  ...n.data,
                  generationProgress: 0.05,
                  generationStatusText: nextStatusText,
                },
              }
            ))
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
          progressValueRef.current = 1
          setGenProgress(1)
          setGenStatusText('Completed!')

          const result = (json.result && typeof json.result === 'object')
            ? (json.result as Record<string, unknown>)
            : {}

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

          doneResetRef.current = setTimeout(() => {
            setGenStatusText('')
            hideProgressRef.current = setTimeout(() => {
              progressValueRef.current = 0
              setGenProgress(0)
              hideProgressRef.current = null
              doneResetRef.current = null
            }, 240)
          }, 1400)

        } else if (json.status === 'failed') {
          clearIntervals()
          progressValueRef.current = 0
          setGenProgress(0)
          setGenStatusText('Generation failed')
          setNodesRef.current(ns => ns.map(n =>
            n.id !== nodeId ? n : {
              ...n,
              data: {
                ...n.data,
                isGenerating:    false,
                activeJobId:     undefined,
                generationProgress: 0,
                generationStatusText: '',
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

  useEffect(() => () => {
    clearIntervals()
    if (doneResetRef.current) clearTimeout(doneResetRef.current)
    if (hideProgressRef.current) clearTimeout(hideProgressRef.current)
  }, [])

  const persistedProgress = typeof data?.generationProgress === 'number' ? data.generationProgress : undefined
  const persistedStatus = typeof data?.generationStatusText === 'string' ? data.generationStatusText : undefined

  const effectiveProgress = data?.isGenerating && persistedProgress !== undefined
    ? persistedProgress
    : genProgress
  const effectiveStatusText = data?.isGenerating
    ? (persistedStatus || genStatusText || 'Queueing job…')
    : genStatusText

  return { genProgress: effectiveProgress, genStatusText: effectiveStatusText }
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
