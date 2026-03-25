"use client"

import React, { memo, useMemo, useState, useEffect, useRef } from 'react'
import { NodeProps, useReactFlow } from 'reactflow'
import { cn } from '@/lib/utils'
import { Filter } from 'lucide-react'
import type { CustomNodeData, FilterResult, FilterResultItem, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { GenerateTextPanel } from '@/components/layout/node_editor/_panels'
import { getThumbnail, getTypeColor } from '@/lib/image-compress'
import { MODULE_BY_ID } from './_registry'

export const meta = {
  id: 'filter',
  name: 'Filter',
  description: 'Filter instances by condition',
  icon: Filter,
  color: 'text-amber-500',
  bg: 'bg-amber-50',
  border: 'hover:border-amber-200',
  opensEditor: true,
  panelTitle: 'Filter Condition',
}

export const defaultData: Partial<CustomNodeData> = {
  type:            'filter',
  label:           'Filter',
  width:           200,
  height:          112,
  filterInputMode: 'label',
}

// Ref at 30%, In at 70%, Out at 50% right.
// Node is 200×112 — 30% = 33.6px, 70% = 78.4px.
export const handles: HandleDef[] = [
  { id: 'ref', side: 'left',  offsetPercent: 30 },
  { id: 'in', side: 'left',  offsetPercent: 70 },
  { id: 'out', side: 'right', offsetPercent: 50 },
]

// ─────────────────────────────────────────────
// Types for connected sources
// ─────────────────────────────────────────────
interface ConnectedSource {
  id: string
  type: string
  label: string
  thumbnail: string | null
  hasOutput: boolean
  src?: string
}

// ─────────────────────────────────────────────
// Hook: Get connected sources for IN port (polling-based, like useUpstreamNodes)
// Returns { sources, ready } — ready becomes true after the first computation
// so callers can distinguish "not yet loaded" from "genuinely empty".
// ─────────────────────────────────────────────
function useConnectedSources(nodeId: string): { sources: ConnectedSource[]; ready: boolean } {
  const { getNodes, getEdges } = useReactFlow()
  const [sources, setSources]     = useState<ConnectedSource[]>([])
  const [ready,   setReady]       = useState(false)
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())

  // Poll for edge/node changes (same pattern as useUpstreamNodes in _upstream_reference.tsx)
  useEffect(() => {
    if (!nodeId) {
      setSources([])
      setReady(true)
      return
    }

    const computeSources = () => {
      const edges = getEdges()
      const nodes = getNodes()

      const incomingEdges = edges.filter((e) => {
        if (e.target !== nodeId) return false
        return e.targetHandle === 'in' || e.targetHandle === 'left' || e.targetHandle === null
      })

      const result: ConnectedSource[] = []
      for (const edge of incomingEdges) {
        const sourceNode = nodes.find((n) => n.id === edge.source)
        if (!sourceNode) continue
        const data = sourceNode.data as CustomNodeData
        const nodeType = data.type || 'text'
        result.push({
          id: sourceNode.id,
          type: nodeType,
          label: data.label || nodeType,
          thumbnail: null,
          hasOutput: !!(data.src || data.videoSrc || data.content || data.type === 'seed'),
          src: data.src,
        })
      }

      // Batch both updates so they commit in a single re-render
      setSources(result)
      setReady(true)
    }

    computeSources()
    const interval = setInterval(computeSources, 500)
    return () => clearInterval(interval)
  }, [nodeId, getNodes, getEdges])

  // Async: generate thumbnails for image sources
  useEffect(() => {
    const abortController = new AbortController()

    async function loadThumbnails() {
      const newThumbnails = new Map<string, string>()
      for (const source of sources) {
        if (abortController.signal.aborted) return
        if (!source.src) continue
        try {
          const thumb = await getThumbnail(source.src, 20)
          if (thumb && !abortController.signal.aborted) {
            newThumbnails.set(source.id, thumb)
          }
        } catch {
          // Ignore thumbnail errors
        }
      }
      if (!abortController.signal.aborted) {
        setThumbnails(newThumbnails)
      }
    }

    loadThumbnails()
    return () => abortController.abort()
  }, [sources])

  // Merge thumbnails
  const withThumbnails = useMemo(
    () => sources.map((s) => ({ ...s, thumbnail: thumbnails.get(s.id) || null })),
    [sources, thumbnails]
  )

  return { sources: withThumbnails, ready }
}

// ─────────────────────────────────────────────
// SourceChip — displays a single source node
// ─────────────────────────────────────────────
function SourceChip({
  source,
  passed,
  showStatus,
}: {
  source: ConnectedSource | (FilterResultItem & { thumbnail?: string | null; type?: string })
  passed?: boolean
  showStatus?: boolean
}) {
  const isImage = 'thumbnail' in source && source.thumbnail
  const typeColor = getTypeColor('type' in source ? (source.type ?? 'text') : 'text')

  return (
    <div
      className={cn(
        'relative flex items-center gap-1',
        'px-1.5 py-0.5 rounded-md',
        'border text-[9px] font-medium',
        'transition-all duration-150',
        showStatus
          ? passed
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-slate-50 border-slate-200 text-slate-400 line-through'
          : 'bg-white border-slate-200 text-slate-600'
      )}
      title={'label' in source ? (source.label ?? source.id) : source.id}
    >
      {showStatus && (
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            passed ? 'bg-emerald-400' : 'bg-slate-300'
          )}
        />
      )}

      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={(source as ConnectedSource).thumbnail!}
          alt={source.label ?? source.id}
          className="w-4 h-4 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div
          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: typeColor + '20' }}
        >
          {(() => {
            const sourceType = ('type' in source ? source.type : 'text') || 'text'
            const mod = MODULE_BY_ID[sourceType]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Icon: React.ComponentType<any> | undefined = mod?.meta?.icon
            if (!Icon) return null
            return <Icon size={10} style={{ color: typeColor }} />
          })()}
        </div>
      )}

      <span className="truncate max-w-[60px]">
        {('label' in source && source.label ? source.label : null) || source.id.slice(-6)}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────
// SourcesList — displays multiple sources before any run
// ─────────────────────────────────────────────
function SourcesList({
  sources,
  maxVisible = 4,
}: {
  sources: ConnectedSource[]
  maxVisible?: number
}) {
  const visible = sources.slice(0, maxVisible)
  const overflow = sources.length - maxVisible

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((source) => (
        <SourceChip key={source.id} source={source} />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] text-slate-400">+{overflow}</span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// FilterResultList — displays pass/fail results
// ─────────────────────────────────────────────
function FilterResultList({
  result,
  sources,
  maxVisible = 4,
}: {
  result: FilterResult
  sources: ConnectedSource[]
  maxVisible?: number
}) {
  const allItems = useMemo(() => {
    const passedItems = result.passed.map((item) => {
      const source = sources.find((s) => s.id === item.id)
      return { ...item, passed: true, thumbnail: source?.thumbnail || null, type: source?.type || item.type || 'text' }
    })
    const filteredItems = result.filtered.map((item) => {
      const source = sources.find((s) => s.id === item.id)
      return { ...item, passed: false, thumbnail: source?.thumbnail || null, type: source?.type || item.type || 'text' }
    })
    return [...passedItems, ...filteredItems]
  }, [result, sources])

  const visible = allItems.slice(0, maxVisible)
  const overflow = allItems.length - maxVisible

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((item) => (
        <SourceChip key={item.id} source={item} passed={item.passed} showStatus />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] text-slate-400">+{overflow}</span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Port rail — the narrow left strip with two labeled connection points.
// ─────────────────────────────────────────────
function PortRail({ h }: { h: number }) {
  const refY = h * 0.3
  const inY  = h * 0.7

  return (
    <div className="absolute left-0 top-0 bottom-0 flex flex-col" style={{ width: 38 }}>
      <div className="absolute inset-0 rounded-l-xl bg-amber-50/70 border-r border-amber-100/80" />

      <div
        className="absolute flex items-center gap-1.5 pl-2 pr-1"
        style={{ top: refY, transform: 'translateY(-50%)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400/90 shrink-0" />
        <span
          className="text-[8px] font-bold tracking-widest text-amber-500/80 leading-none select-none"
          style={{ fontVariant: 'all-small-caps' }}
        >
          REF
        </span>
      </div>

      <div
        className="absolute left-[10px] w-px bg-amber-200/50"
        style={{ top: refY, height: inY - refY }}
      />

      <div
        className="absolute flex items-center gap-1.5 pl-2 pr-1"
        style={{ top: inY, transform: 'translateY(-50%)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-slate-300/90 shrink-0" />
        <span
          className="text-[8px] font-bold tracking-widest text-slate-400/70 leading-none select-none"
          style={{ fontVariant: 'all-small-caps' }}
        >
          IN
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// NodeUI
// ─────────────────────────────────────────────
export const NodeUI = ({
  data,
  selected,
  nodeId,
}: {
  data: CustomNodeData
  selected?: boolean
  nodeId?: string
}) => {
  const W = data.width  ?? 200
  const H = data.height ?? 112

  const { sources: connectedSources, ready: sourcesReady } = useConnectedSources(nodeId || '')
  const { setNodes, getNodes } = useReactFlow()

  // Stable ref to avoid stale closure in the sync effect
  const filterResultRef = useRef(data.filterResult)
  filterResultRef.current = data.filterResult

  // ── Auto-sync filterResult with IN connections ──────────────────────────
  // When nodes connect/disconnect from IN port, update filterResult accordingly:
  //   - new connection  → add to passed  (default: all pass)
  //   - disconnection   → remove from both passed and filtered
  //
  // IMPORTANT: only run after sources are first computed (sourcesReady).
  // Without this guard, the initial render sees connectedSources=[] and would
  // incorrectly remove all saved filterResult items before the first polling
  // interval completes — wiping persisted state on every page load.
  useEffect(() => {
    if (!nodeId || !sourcesReady) return

    const fr = filterResultRef.current
    const currentSourceIds = new Set(connectedSources.map((s) => s.id))
    const prevPassed   = fr?.passed   ?? []
    const prevFiltered = fr?.filtered ?? []
    const prevIds      = new Set([...prevPassed, ...prevFiltered].map((i) => i.id))

    const added             = connectedSources.filter((s) => !prevIds.has(s.id))
    const removedFromPassed = prevPassed.filter((item) => !currentSourceIds.has(item.id))
    const removedFromFiltered = prevFiltered.filter((item) => !currentSourceIds.has(item.id))

    if (added.length === 0 && removedFromPassed.length === 0 && removedFromFiltered.length === 0) return

    const newPassed: FilterResultItem[] = [
      ...prevPassed.filter((item) => currentSourceIds.has(item.id)),
      ...added.map((s) => ({ id: s.id, label: s.label, type: s.type })),
    ]
    const newFiltered: FilterResultItem[] = prevFiltered.filter((item) => currentSourceIds.has(item.id))

    // Compute output content (joined content of passed nodes) for downstream references
    const currentNodes = getNodes()
    const passedContent = newPassed
      .map((item) => {
        const node = currentNodes.find((n) => n.id === item.id)
        if (!node) return ''
        const d = node.data as CustomNodeData & { src?: string; videoSrc?: string }
        return d.content || d.src || d.videoSrc || ''
      })
      .filter(Boolean)
      .join('\n\n')

    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n
        return {
          ...n,
          data: {
            ...n.data,
            filterResult: { passed: newPassed, filtered: newFiltered, reply: fr?.reply },
            content: passedContent,
          },
        }
      })
    )
  }, [connectedSources, nodeId, sourcesReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasResult    = !!data.filterResult
  const hasCondition = !!data.prompt?.trim()

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'bg-white/80 border border-slate-200/80',
        'transition-[box-shadow,border-color] duration-200',
        selected ? 'border-amber-300/80' : 'shadow-[0_1px_4px_rgba(0,0,0,0.06)]',
        data.isEditing && 'border-amber-400/70'
      )}
      style={{ width: W, height: H, borderRadius: 14 }}
    >
      <PortRail h={H} />

      {/* Main content area */}
      <div
        className="absolute inset-0 flex flex-col justify-center gap-1"
        style={{ paddingLeft: 48, paddingRight: 10, paddingTop: 6, paddingBottom: 6 }}
      >
        {hasResult ? (
          <>
            <FilterResultList result={data.filterResult!} sources={connectedSources} />
            {data.filterResult!.reply && (
              <p className="text-[9px] leading-snug text-slate-400 line-clamp-2 italic">
                {data.filterResult!.reply}
              </p>
            )}
          </>
        ) : connectedSources.length > 0 ? (
          <SourcesList sources={connectedSources} />
        ) : hasCondition ? (
          <p className="text-[10.5px] leading-snug text-slate-600/90 line-clamp-3 font-medium w-full text-center">
            {data.prompt?.trim()}
          </p>
        ) : (
          <p className="text-[10px] text-slate-300/80 italic leading-snug select-none w-full text-center">
            Connect nodes to IN port…
          </p>
        )}
      </div>

      {/* Right output tick */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] rounded-l-full"
        style={{
          height: 20,
          background: selected ? 'rgba(251,191,36,0.45)' : 'rgba(203,213,225,0.6)',
          transition: 'background 200ms',
        }}
      />
    </div>
  )
}

export const ReactFlowNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} nodeId={id} />
))
ReactFlowNode.displayName = 'FilterNode'

export function ModalContent({
  data,
  nodeId,
  onUpdate,
  mode = 'auto',
  isGenerating = false,
  onGenerate,
  onStop,
}: ModuleModalProps) {
  return (
    <GenerateTextPanel
      data={data as CustomNodeData}
      nodeId={nodeId}
      refHandleId="ref"
      onDataChange={onUpdate as (u: Partial<CustomNodeData>) => void}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
      placeholder={{
        auto: 'Set the filter condition — reference nodes via the REF handle…',
        manual: 'Describe the filter condition (outputs JSON)…',
      }}
    />
  )
}
