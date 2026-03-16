"use client"

import { useState, useEffect, useRef } from 'react'
import { useReactFlow } from 'reactflow'

const POLL_MS = 1500

/**
 * useNodePolling
 *
 * Polls /api/jobs/[activeJobId] while data.isGenerating is true.
 * Lives in the node's own React tree (NodeWrapper) so generation
 * continues independently of whether the node editor is open.
 *
 * On completion:
 *  - image nodes: decodes b64 → uploads to MinIO → updates node dimensions
 *  - all others:  writes result.content to node.data.content
 *
 * Returns genProgress (0–1) for the overlay animation.
 */
export function useNodePolling(
  nodeId: string | undefined,
  data:   any,
) {
  const { setNodes }   = useReactFlow()
  const [genProgress, setGenProgress] = useState(0)

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeJobRef = useRef<string | null>(null)
  // Stable ref so async callbacks always see the latest setNodes
  const setNodesRef  = useRef(setNodes)
  setNodesRef.current = setNodes

  const clearIntervals = () => {
    if (pollRef.current)     { clearInterval(pollRef.current);     pollRef.current     = null }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null }
    activeJobRef.current = null
  }

  useEffect(() => {
    const jobId      = data?.activeJobId  as string  | undefined
    const generating = data?.isGenerating as boolean | undefined
    const nodeType   = data?.type         as string  | undefined

    // Generation cancelled externally (editor stop, mode change, etc.)
    if (!generating) {
      clearIntervals()
      setGenProgress(0)
      return
    }

    // isGenerating:true but no jobId yet — waiting for POST /api/jobs response
    if (!jobId || !nodeId) return

    // Already polling this job
    if (activeJobRef.current === jobId) return

    // New job — start fresh
    clearIntervals()
    activeJobRef.current = jobId

    // Fake progress crawl (50ms ticks, caps at 0.9)
    progressRef.current = setInterval(() => {
      setGenProgress(p => Math.min(p + 0.006 + Math.random() * 0.006, 0.9))
    }, 50)

    // Actual poll
    pollRef.current = setInterval(async () => {
      if (activeJobRef.current !== jobId) return

      try {
        const res     = await fetch(`/api/jobs/${jobId}`)
        const rawText = await res.text()
        let json: any
        try { json = JSON.parse(rawText) } catch { return } // transient parse error — keep polling

        if (json.status === 'done') {
          clearIntervals()
          setGenProgress(1)

          const result = json.result as Record<string, any>

          if (nodeType === 'image') {
            // Decode b64 → Blob
            const mime   = result.mime || 'image/png'
            const binary = atob(result.b64)
            const ab     = new ArrayBuffer(binary.length)
            const ia     = new Uint8Array(ab)
            for (let i = 0; i < binary.length; i++) ia[i] = binary.charCodeAt(i)
            const blob = new Blob([ab], { type: mime })

            // Upload to MinIO for persistence; fall back to blob URL
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

            // Measure natural dimensions
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
          } else {
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

  // Cleanup when node is removed from canvas
  useEffect(() => () => { clearIntervals() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { genProgress }
}
