"use client"

import React, { memo, useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { NodeProps, useReactFlow } from 'reactflow'
import { cn } from '@/lib/utils'
import { Filter, Plus, Trash2, Zap, Square, Lock, ChevronUp, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import type { CustomNodeData, FilterResult, FilterResultItem, ModuleModalProps } from '../_types'
import type { HandleDef } from '../_handle'
import { RefPromptEditor, type RefPromptEditorHandle } from '@/components/layout/node_editor/_panels'
import { UpstreamReference } from '@/components/layout/node_editor/_upstream_reference'
import { getThumbnail, getTypeColor } from '@/lib/image-compress'
import { MODULE_BY_ID } from '../_registry'
import { TEXT_MODELS } from '@/lib/models'
import { creditLabel } from '@/lib/credits'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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
  category: 'Logic',
}

export const defaultData: Partial<CustomNodeData> = {
  type:            'filter',
  label:           'Filter',
  width:           200,
  height:          112,
  filterInputMode: 'label',
  filterLatestInputOnly: false,
  filterReversed:  false,
  filterOutputRules: [],
  filterSelectedIds: [],
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

interface FilterOutputRule {
  range: string
}

function defaultParamsForModel(modelId: string): Record<string, string> {
  const def = TEXT_MODELS.find((m) => m.id === modelId)
  return Object.fromEntries((def?.params ?? []).map((p) => [p.key, p.default]))
}

function parseIndexExpression(expr: string, maxIndex?: number): number[] {
  if (!expr?.trim()) return []
  const out = new Set<number>()
  const tokens = expr.split(',').map((s) => s.trim()).filter(Boolean)

  for (const token of tokens) {
    const m = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      const start = Math.min(a, b)
      const end = Math.max(a, b)
      for (let i = start; i <= end; i++) {
        if (i < 1) continue
        if (maxIndex && i > maxIndex) continue
        out.add(i)
      }
      continue
    }
    const single = Number(token)
    if (Number.isFinite(single) && single >= 1) {
      if (!maxIndex || single <= maxIndex) out.add(single)
    }
  }

  return [...out].sort((a, b) => a - b)
}

function resolveSelectedIdsWithRules(
  sources: ConnectedSource[],
  rules: FilterOutputRule[],
  options?: { includeLatest?: boolean },
): string[] {
  const maxIndex = sources.length
  const selectedIndexSet = new Set<number>()

  for (const rule of rules) {
    for (const idx of parseIndexExpression(rule.range, maxIndex)) {
      selectedIndexSet.add(idx)
    }
  }

  if (options?.includeLatest && maxIndex > 0) {
    selectedIndexSet.add(maxIndex)
  }

  return [...selectedIndexSet]
    .sort((a, b) => a - b)
    .map((idx) => sources[idx - 1]?.id)
    .filter((id): id is string => typeof id === 'string')
}

function isSameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function isSameFilterItems(
  a: FilterResultItem[],
  b: FilterResultItem[],
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.id !== y.id || x.label !== y.label || x.type !== y.type) return false
  }
  return true
}

function isSameFilterResult(
  a: FilterResult | undefined,
  b: FilterResult | undefined,
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    isSameFilterItems(a.passed, b.passed) &&
    isSameFilterItems(a.filtered, b.filtered) &&
    (a.reply ?? '') === (b.reply ?? '')
  )
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
      const timer = setTimeout(() => {
        setSources([])
        setReady(true)
      }, 0)
      return () => clearTimeout(timer)
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

function SourceStatusList({
  sources,
  selectedIds,
  maxVisible = 4,
}: {
  sources: ConnectedSource[]
  selectedIds: Set<string>
  maxVisible?: number
}) {
  const visible = sources.slice(0, maxVisible)
  const overflow = sources.length - maxVisible

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((source) => {
        const selected = selectedIds.has(source.id)
        return (
          <div key={source.id} title={selected ? 'Selected for output' : 'Filtered out'}>
            <SourceChip source={source} passed={selected} showStatus />
          </div>
        )
      })}
      {overflow > 0 && (
        <span className="text-[9px] text-slate-400">+{overflow}</span>
      )}
    </div>
  )
}

function FilterRulesEditor({
  rules,
  onChange,
  disabled,
}: {
  rules: FilterOutputRule[]
  onChange: (next: FilterOutputRule[]) => void
  disabled?: boolean
}) {
  const displayRules = rules.length > 0 ? rules : [{ range: '' }]

  const setRule = (idx: number, patch: Partial<FilterOutputRule>) => {
    const next = displayRules.map((r, i) => i === idx ? { ...r, ...patch } : r)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {displayRules.map((rule, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <div className="flex-1 space-y-1">
            <p className="text-[10px] text-slate-400">Output index / range</p>
            <input
              value={rule.range}
              disabled={disabled}
              onChange={(e) => setRule(idx, { range: e.target.value })}
              placeholder="1,3,5-7"
              className="w-full h-8 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-amber-300"
            />
          </div>
          <button
            disabled={disabled}
            onClick={() => onChange(displayRules.filter((_, i) => i !== idx))}
            className="mt-6 p-1.5 text-slate-400 hover:text-amber-500 disabled:opacity-30"
            title="Delete range"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          disabled={disabled}
          onClick={() => onChange([...rules, { range: '' }])}
          className="inline-flex items-center gap-1 text-[11px] text-amber-500 hover:text-amber-600 disabled:opacity-30"
        >
          <Plus size={11} /> Add range
        </button>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        Use 1-based input order: e.g. 1,3,5-7. Leave empty for zero output.
      </p>
    </div>
  )
}

function FilterModelDropdown({
  value,
  onChange,
  locked,
}: {
  value: string
  onChange: (id: string) => void
  locked?: boolean
}) {
  const name = TEXT_MODELS.find((m) => m.id === value)?.name ?? value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={locked}>
        <button
          disabled={locked}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full text-xs text-slate-600 font-medium transition-all border border-transparent",
            locked
              ? "opacity-30 cursor-not-allowed"
              : "hover:bg-slate-100/80 hover:border-slate-200/80",
          )}
        >
          {name}
          <ChevronUp size={10} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
          Model
        </div>
        {TEXT_MODELS.map((m) => (
          <DropdownMenuItem
            key={m.id}
            className={cn("text-xs", value === m.id && "font-semibold text-slate-800")}
            onClick={() => onChange(m.id)}
          >
            {m.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FilterModelParamsPopover({
  model,
  selected,
  onChange,
  locked,
}: {
  model: string
  selected: Record<string, string>
  onChange: (id: string, val: string) => void
  locked?: boolean
}) {
  const params = TEXT_MODELS.find((m) => m.id === model)?.params ?? []
  if (params.length === 0) return null

  const summary = params.map((p) => selected[p.key] ?? p.default).join(' · ')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          disabled={locked}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs text-slate-600 font-medium transition-all border border-transparent',
            locked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100/80 hover:border-slate-200/80',
          )}
        >
          <SlidersHorizontal size={10} className="text-slate-400" />
          <span>{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-60 p-3">
        <div className="space-y-3">
          {params.map((param) => (
            <div key={param.key}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {param.label}
              </p>
              <div className={cn(
                'bg-slate-100 rounded-lg p-0.5 gap-0.5',
                param.options.length <= 4 ? 'flex' : 'grid grid-cols-4',
              )}>
                {param.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => onChange(param.key, opt)}
                    className={cn(
                      'py-1 text-xs font-medium rounded-md transition-all',
                      param.options.length <= 4 ? 'flex-1' : '',
                      (selected[param.key] ?? param.default) === opt
                        ? 'bg-white shadow-sm text-slate-800'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
function PortRail({ h, reversed = false }: { h: number; reversed?: boolean }) {
  const refY = h * 0.3
  const inY  = h * 0.7
  const isReversed = !!reversed
  const railSideClass = isReversed ? 'right-0 rounded-r-xl border-l' : 'left-0 rounded-l-xl border-r'
  const rowSideClass = isReversed ? 'right-0 pr-2 pl-1 justify-end text-right' : 'left-0 pl-2 pr-1'
  const lineSideStyle = isReversed ? { right: 10 } : { left: 10 }

  return (
    <div className={cn('absolute top-0 bottom-0 flex flex-col', isReversed ? 'right-0' : 'left-0')} style={{ width: 38 }}>
      <div className={cn('absolute inset-0 bg-amber-50/70 border-amber-100/80', railSideClass)} />

      <div
        className={cn('absolute flex items-center gap-1.5', rowSideClass)}
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
        className="absolute w-px bg-amber-200/50"
        style={{ ...lineSideStyle, top: refY, height: inY - refY }}
      />

      <div
        className={cn('absolute flex items-center gap-1.5', rowSideClass)}
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
  const isReversed = !!data.filterReversed

  const { sources: connectedSources, ready: sourcesReady } = useConnectedSources(nodeId || '')
  const { setNodes, getNodes } = useReactFlow()

  // Keep filter output state synchronized with current IN connections.
  // For no-prompt mode this enforces explicit output semantics:
  // - no selection => zero output
  // - latest-input-only => only newest IN source
  useEffect(() => {
    if (!nodeId || !sourcesReady) return

    const currentSourceIds = new Set(connectedSources.map((s) => s.id))
    const hasPrompt = !!data.prompt?.trim()
    const latestOnly = Boolean(data.filterLatestInputOnly)
    const rules = (Array.isArray(data.filterOutputRules) ? data.filterOutputRules : [])
      .map((r) => ({ range: String((r as FilterOutputRule).range ?? '').trim() }))
    const effectiveSelected = resolveSelectedIdsWithRules(connectedSources, rules, { includeLatest: latestOnly })
      .filter((id) => currentSourceIds.has(id))

    const effectiveSelectedSet = new Set(effectiveSelected)
    const newPassed: FilterResultItem[] = connectedSources
      .filter((s) => effectiveSelectedSet.has(s.id))
      .map((s) => ({ id: s.id, label: s.label, type: s.type }))
    const newFiltered: FilterResultItem[] = connectedSources
      .filter((s) => !effectiveSelectedSet.has(s.id))
      .map((s) => ({ id: s.id, label: s.label, type: s.type }))

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

    const currentFilterResult = data.filterResult
    const nextFilterResult = hasPrompt
      ? currentFilterResult
      : { passed: newPassed, filtered: newFiltered, reply: currentFilterResult?.reply }

    const originalSelected = Array.isArray(data.filterSelectedIds)
      ? (data.filterSelectedIds as string[]).filter((id): id is string => typeof id === 'string')
      : []
    const shouldNormalizeSelected = !isSameStringArray(originalSelected, effectiveSelected)
    const shouldSyncOutput = !hasPrompt && (
      !isSameFilterResult(currentFilterResult, nextFilterResult) ||
      (data.content ?? '') !== passedContent
    )

    if (!shouldNormalizeSelected && !shouldSyncOutput) return

    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n

        let changed = false
        const nextData: Record<string, unknown> = { ...n.data }

        const existingSelected = Array.isArray(n.data.filterSelectedIds)
          ? (n.data.filterSelectedIds as string[]).filter((id): id is string => typeof id === 'string')
          : []
        if (!isSameStringArray(existingSelected, effectiveSelected)) {
          nextData.filterSelectedIds = effectiveSelected
          changed = true
        }

        if (!hasPrompt) {
          const existingResult = n.data.filterResult as FilterResult | undefined
          if (!isSameFilterResult(existingResult, nextFilterResult)) {
            nextData.filterResult = nextFilterResult
            changed = true
          }
          const existingContent = typeof n.data.content === 'string' ? n.data.content : ''
          if (existingContent !== passedContent) {
            nextData.content = passedContent
            changed = true
          }
        }

        if (!changed) return n

        return {
          ...n,
          data: nextData,
        }
      })
    )
  }, [connectedSources, nodeId, sourcesReady, data.filterResult, data.filterSelectedIds, data.filterLatestInputOnly, data.filterOutputRules, data.prompt]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasResult    = !!data.filterResult
  const hasCondition = !!data.prompt?.trim()
  const selectedIdsSet = useMemo(
    () => new Set((Array.isArray(data.filterSelectedIds) ? data.filterSelectedIds : []).filter((id): id is string => typeof id === 'string')),
    [data.filterSelectedIds]
  )

  const isSelected = !!selected
  const isEditing = !!data.isEditing
  const shouldShowAiResult = hasCondition && hasResult

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'bg-white/80 border',
        'transition-[box-shadow,border-color] duration-200',
      )}
      style={{
        width: W,
        height: H,
        borderRadius: 14,
        borderColor: isSelected || isEditing
          ? 'rgba(245,158,11,0.62)'
          : (data.done === true || data.mode === 'note')
            ? 'rgba(245,158,11,0.52)'
            : 'rgba(100,116,139,0.36)',
        boxShadow: isSelected
          ? '0 6px 16px rgba(15,23,42,0.10), 0 0 0 1px rgba(245,158,11,0.20), 0 0 10px rgba(251,191,36,0.14)'
          : 'none',
      }}
    >
      <PortRail h={H} reversed={isReversed} />

      {/* Main content area */}
      <div
        className="absolute inset-0 flex flex-col justify-center gap-1"
        style={{
          paddingLeft: isReversed ? 10 : 48,
          paddingRight: isReversed ? 48 : 10,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        {shouldShowAiResult ? (() => {
          const aiResult = data.filterResult!
          // Union: manual selected IDs + AI passed IDs
          const unionPassedIds = new Set([
            ...selectedIdsSet,
            ...aiResult.passed.map((i) => i.id),
          ])
          const unionPassed = connectedSources
            .filter((s) => unionPassedIds.has(s.id))
            .map((s) => ({ id: s.id, label: s.label, type: s.type }))
          const unionFiltered = connectedSources
            .filter((s) => !unionPassedIds.has(s.id))
            .map((s) => ({ id: s.id, label: s.label, type: s.type }))
          const displayResult = { passed: unionPassed, filtered: unionFiltered, reply: aiResult.reply }
          return (
            <>
              <FilterResultList result={displayResult} sources={connectedSources} />
              {aiResult.reply && (
                <p className="text-[9px] leading-snug text-slate-400 line-clamp-2 italic">
                  {aiResult.reply}
                </p>
              )}
            </>
          )
        })() : connectedSources.length > 0 ? (
          <SourceStatusList
            sources={connectedSources}
            selectedIds={selectedIdsSet}
          />
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
        className={cn(
          'absolute top-1/2 -translate-y-1/2 w-[3px]',
          isReversed ? 'left-0 rounded-r-full' : 'right-0 rounded-l-full',
        )}
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
  const { getNodes, getEdges } = useReactFlow()
  const d = data as CustomNodeData
  const persist = onUpdate as (updates: Partial<CustomNodeData>) => void
  const editorRef = useRef<RefPromptEditorHandle>(null)

  const prompt = d.prompt ?? ''
  const model = d.model ?? TEXT_MODELS[0].id
  const params = (d.params as Record<string, string> | undefined) ?? defaultParamsForModel(model)
  const rules = useMemo(
    () => (d.filterOutputRules as FilterOutputRule[] | undefined) ?? [],
    [d.filterOutputRules]
  )
  const includeLatestOutput = Boolean(d.filterLatestInputOnly)

  const isAuto = mode === 'auto'
  const isNote = mode === 'note'

  const setPromptValue = (v: string) => {
    persist({ prompt: v })
  }

  const setModelValue = (v: string) => {
    const nextParams = defaultParamsForModel(v)
    persist({ model: v, params: nextParams })
  }

  const setParamValue = (id: string, val: string) => {
    const next = { ...params, [id]: val }
    persist({ params: next })
  }

  const setRulesValue = (next: FilterOutputRule[]) => {
    const normalized = next.map((r) => ({ range: String(r.range ?? '').trim() }))
    persist({ filterOutputRules: normalized })
  }

  const setIncludeLatestOutputValue = (enabled: boolean) => {
    persist({ filterLatestInputOnly: enabled })
  }

  const handleInsertReference = useCallback((ref: string) => {
    const id = ref.replace(/^\{\{/, '').replace(/\}\}$/, '')
    editorRef.current?.insertReference(id)
  }, [])

  const connectedSources = useMemo(() => {
    if (!nodeId) return [] as ConnectedSource[]
    const edges = getEdges().filter((e) => {
      if (e.target !== nodeId) return false
      return e.targetHandle === 'in' || e.targetHandle === 'left' || e.targetHandle === null
    })
    const nodes = getNodes()
    return edges.map((e) => {
      const n = nodes.find((x) => x.id === e.source)
      const nd = n?.data as CustomNodeData | undefined
      return {
        id: e.source,
        type: nd?.type || 'text',
        label: nd?.label || nd?.type || e.source.slice(-6),
        thumbnail: null,
        hasOutput: Boolean(nd?.content || nd?.src || nd?.videoSrc),
        src: nd?.src,
      } satisfies ConnectedSource
    })
  }, [nodeId, getEdges, getNodes])

  const resolvedSelectionIds = useMemo(
    () => resolveSelectedIdsWithRules(connectedSources, rules, { includeLatest: includeLatestOutput }),
    [connectedSources, rules, includeLatestOutput]
  )
  const selectionPreview = useMemo(() => {
    if (resolvedSelectionIds.length === 0) return 'Output: -'
    const indices = resolvedSelectionIds
      .map((id) => connectedSources.findIndex((s) => s.id === id) + 1)
      .filter((n) => n > 0)
    const head = indices.slice(0, 6).join(',')
    return `Output: #${head}${indices.length > 6 ? ` +${indices.length - 6}` : ''}`
  }, [resolvedSelectionIds, connectedSources])

  const hasUpstreamImage = nodeId ? (() => {
    const edges = getEdges().filter((e) => e.target === nodeId && e.targetHandle === 'ref')
    const nodes = getNodes()
    return edges.some((e) => {
      const src = nodes.find((n) => n.id === e.source)
      return src?.data?.type === 'image'
    })
  })() : false
  const textModelDef = TEXT_MODELS.find((m) => m.id === model)
  const showImageInputWarning = hasUpstreamImage && !textModelDef?.supportsImageInput

  return (
    <div className="flex flex-col">
      <div className="px-3 pt-2 pb-2 border-b border-slate-100">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Output selector</p>
          <button
            type="button"
            disabled={isGenerating || isNote}
            onClick={() => setIncludeLatestOutputValue(!includeLatestOutput)}
            className={cn(
              'h-6 px-1 text-[10px] transition-all inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700',
              (isGenerating || isNote) && 'opacity-30 cursor-not-allowed',
            )}
            title="Also include latest input"
          >
            <span className={cn(
              'relative inline-flex h-3.5 w-6 rounded-full transition-colors',
              includeLatestOutput ? 'bg-amber-400' : 'bg-slate-300',
            )}>
              <span className={cn(
                'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform',
                includeLatestOutput ? 'translate-x-3' : 'translate-x-0.5',
              )} />
            </span>
            Latest output
          </button>
        </div>

        <FilterRulesEditor
          rules={rules}
          onChange={setRulesValue}
          disabled={isGenerating || isNote}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400" title={selectionPreview}>
            {selectionPreview}
          </span>
          <span className="text-[10px] text-slate-400">IN count: {connectedSources.length}</span>
        </div>
      </div>

      {nodeId && <UpstreamReference nodeId={nodeId} handleId="ref" onInsertReference={handleInsertReference} />}

      <RefPromptEditor
        ref={editorRef}
        value={prompt}
        onChange={(v) => !isGenerating && setPromptValue(v)}
        placeholder={
          isNote
            ? 'Write a note about this filter…'
            : isAuto
              ? 'Describe filter condition and reference REF nodes…'
              : 'Optional: run AI classification and parse JSON…'
        }
        readOnly={isGenerating}
        minHeight={90}
      />
      {showImageInputWarning && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border-t border-amber-100 text-amber-700 text-[11px]">
          <AlertTriangle size={11} className="flex-shrink-0" />
          <span>{textModelDef?.name ?? model} does not support image input. Switch to Gemini, Claude, or GPT to use image references.</span>
        </div>
      )}

      <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        <FilterModelDropdown value={model} onChange={setModelValue} locked={isGenerating || isNote} />
        <FilterModelParamsPopover
          model={model}
          selected={params}
          onChange={setParamValue}
          locked={isGenerating || isNote}
        />

        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-300/80"
          >
            <Square size={10} className="fill-amber-600" /> Stop
          </button>
        ) : isAuto || isNote ? (
          <>
            <span className="ml-auto text-xs text-slate-500">{creditLabel(model, params)}</span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-slate-300 border border-slate-100 select-none">
              <Lock size={10} /> {isNote ? 'Note mode' : 'Runs in workflow'}
            </div>
          </>
        ) : (
          <>
            <span className="ml-auto text-xs text-slate-500">{creditLabel(model, params)}</span>
            <button
              disabled={!prompt.trim()}
              onClick={() => onGenerate?.(prompt, model, params)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all",
                prompt.trim()
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80"
                  : "text-slate-300 cursor-not-allowed border border-slate-200/60",
              )}
            >
              <Zap size={11} /> Generate
            </button>
          </>
        )}
      </div>
    </div>
  )
}
export { resultHandler } from './resultHandler'
export { ActionBarContent } from './actionBar'
