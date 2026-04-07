"use client"

import React, { memo, useRef, useCallback, useState, useEffect, useContext, createContext } from 'react'
import { NodeProps } from 'reactflow'
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from 'reactflow'
import { cn } from '@/lib/utils'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { ActionBarProps } from './_action_bar_types'
import { HandleDef, MagneticZone, ResizeHandle, SIDE_TO_POSITION, getHandleStyle, getHandleClassName, sideToHandleType } from './_handle'
import { GeneratingOverlay, ErrorOverlay } from './_overlay'
import { useNodePolling }    from './_polling'
import { getTypeColor, getThumbnail } from '@/lib/image-compress'
import { getRefChipIconSvgInner } from '@/components/layout/node_editor/_ref_chip_icon'

import * as Standard from './standard'
import * as Text     from './text'
import * as Image    from './image'
import * as Video    from './video'
import * as Pdf      from './pdf'
import * as Filter    from './filter'
import * as Template  from './template'
import * as Seed      from './seed'
import * as Lasso    from './lasso'   // ← new

// ─────────────────────────────────────────────
// EditorOpenContext — which node's editor is currently open
// canvas.tsx provides editorNodeId; NodeWrapper consumes it to
// hide the inline prompt preview while the panel is visible.
// ─────────────────────────────────────────────
export const EditorOpenContext = createContext<string | null>(null)

// ─────────────────────────────────────────────
// Module registry
// ─────────────────────────────────────────────
export interface ModuleMeta {
  id: string; name: string; description: string
  icon: React.ComponentType<any>
  color: string; bg: string; border: string
  isStandard?: boolean
  panelTitle?: string
  opensEditor?: boolean
  /** Picker section: 'Assets' | 'Logic' — omit to hide from picker */
  category?: string
  /** Model badge shown in picker (e.g. "Gemini", "FLUX") */
  modelBadge?: string
  /** Edge color when this node type is "done" (CSS rgba string) */
  doneColor?: string
}

export interface ResultHandlerContext {
  setNodes: (fn: (nodes: any[]) => any[]) => void
  getNodes: () => any[]
  getEdges: () => any[]
  nodeId: string
}

export interface ModuleDefinition {
  meta: ModuleMeta
  defaultData:  Record<string, any>
  handles:      HandleDef[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NodeUI:       React.ComponentType<{ data: any; selected?: boolean; nodeId?: string }>
  ModalContent: React.ComponentType<ModuleModalProps>
  /** Process job result. If undefined, default text handler is used. */
  resultHandler?: (result: Record<string, any>, ctx: ResultHandlerContext) => Promise<void>
  /** Type-specific action bar buttons. If undefined, no type-specific buttons shown. */
  ActionBarContent?: React.ComponentType<ActionBarProps>
}

export const MODULES: ModuleDefinition[] = [
  Standard, Text, Image, Video, Pdf, Filter, Template, Seed, Lasso,
] as unknown as ModuleDefinition[]

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.meta.id, m]))

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
export { StandardNodeUI } from './standard'

export function getCustomNodeUI(
  type: string,
): React.ComponentType<{ data: any; selected?: boolean }> | null {
  return MODULE_BY_ID[type]?.NodeUI ?? null
}

export const CustomNodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const UI = MODULE_BY_ID[data.type]?.NodeUI
  if (!UI) return null
  return <UI data={data} selected={selected} />
}

// ─────────────────────────────────────────────
// NodeLabel — editable title with type icon
// ─────────────────────────────────────────────
function NodeLabel({
  label,
  nodeId,
  nodeType,
  selected,
}: {
  label:     string
  nodeId?:   string
  nodeType?: string
  selected:  boolean
}) {
  const { setNodes } = useReactFlow()
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external label changes (e.g. undo/redo)
  useEffect(() => { if (!editing) setValue(label) }, [label, editing])

  const mod       = nodeType ? MODULE_BY_ID[nodeType] : null
  const Icon      = mod?.meta.icon ?? null
  const iconColor = mod?.meta.color ?? 'text-slate-400'

  const startEdit = () => {
    if (!selected || !nodeId) return
    setEditing(true)
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (input) {
        const len = input.value.length
        input.setSelectionRange(len, len)
      }
    })
  }

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (!nodeId || trimmed === label) return
    setNodes(ns => ns.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, label: trimmed } } : n
    ))
  }

  return (
    <div
      className="absolute flex items-center gap-[3px]"
      style={{ bottom: '100%', left: 3, paddingBottom: 2 }}
      onMouseDown={e => { if (editing || selected) e.stopPropagation() }}
    >
      {Icon && (
        <Icon
          size={10}
          strokeWidth={2}
          className={cn('flex-shrink-0 opacity-50', iconColor)}
        />
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setValue(label); setEditing(false) }
          }}
          className="text-[11.5px] font-medium text-slate-500 tracking-tight bg-transparent outline-none border-b border-slate-300/80 min-w-[32px] max-w-[180px]"
          style={{ width: `${Math.max(value.length, 4) + 1}ch` }}
        />
      ) : (
        <span
          onClick={startEdit}
          className={cn(
            'text-[11.5px] font-medium text-slate-400/80 tracking-tight whitespace-nowrap select-none',
            selected && nodeId && 'cursor-text hover:text-slate-500 transition-colors duration-100',
          )}
        >
          {value}
        </span>
      )}
    </div>
  )
}

// Edge color per node type when target is "done" — built from module meta.doneColor
export const DONE_COLOR: Record<string, string> = Object.fromEntries(
  MODULES.filter(m => m.meta.doneColor).map(m => [m.meta.id, m.meta.doneColor!])
)

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// InlinePromptPreview — shown below node when showPromptInline is true
// Lives inside the ReactFlow node → scales automatically with canvas zoom
// ─────────────────────────────────────────────
const INLINE_REF_SPLIT = /(\{\{[^}]+\}\})/g

function InlinePromptPreview({ prompt, truncate }: { prompt: string; truncate?: boolean }) {
  const { getNodes } = useReactFlow()
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map())
  const loadingThumbsRef = useRef<Set<string>>(new Set())

  const parts = prompt.split(INLINE_REF_SPLIT)

  useEffect(() => {
    let cancelled = false
    const nodes = getNodes()
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const refIds = new Set<string>()

    for (const part of parts) {
      const m = part.match(/^\{\{([^}]+)\}\}$/)
      if (m) refIds.add(m[1].trim())
    }

    for (const nodeId of refIds) {
      const node = nodeById.get(nodeId)
      const d = node?.data as CustomNodeData | undefined
      const src = d?.src || d?.videoPoster
      if (!src || thumbCache.has(src) || loadingThumbsRef.current.has(src)) continue

      loadingThumbsRef.current.add(src)
      getThumbnail(src, 28)
        .then((thumb) => {
          if (!thumb || cancelled) return
          setThumbCache((prev) => {
            if (prev.has(src)) return prev
            return new Map(prev).set(src, thumb)
          })
        })
        .catch(() => {})
        .finally(() => {
          loadingThumbsRef.current.delete(src)
        })
    }

    return () => { cancelled = true }
  }, [getNodes, parts, thumbCache])

  const nodeById = new Map(getNodes().map((n) => [n.id, n]))

  return (
    <div
      className="absolute left-0 right-0 pointer-events-none"
      style={{ top: 'calc(100% + 8px)' }}
    >
      <p className={cn(
        "text-[11px] text-slate-400 leading-relaxed m-0",
        truncate
          ? "overflow-hidden whitespace-nowrap text-ellipsis"
          : "break-words",
      )}>
        {parts.map((part, i) => {
          const m = part.match(/^\{\{([^}]+)\}\}$/)
          if (m) {
            const nodeId  = m[1].trim()
            const node    = nodeById.get(nodeId)
            const d       = node?.data as CustomNodeData | undefined
            const label   = d?.label || nodeId.slice(-6)
            const type    = d?.type  || 'text'
            const color   = getTypeColor(type)
            const src     = d?.src || d?.videoPoster
            const thumb   = src ? thumbCache.get(src) : undefined
            return (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 4px 2px 3px',
                background: 'white', border: '1px solid #e2e8f0',
                borderRadius: 6, color: '#475569',
                fontSize: 9, fontWeight: 500,
                verticalAlign: 'middle', userSelect: 'none', lineHeight: 'normal',
                margin: '0 1px',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: 4,
                  background: thumb ? 'transparent' : color + '20',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={label}
                      style={{ width: 16, height: 16, objectFit: 'cover', display: 'block', borderRadius: 4 }}
                    />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width={10} height={10} viewBox="0 0 24 24"
                      fill="none" stroke={color} strokeWidth={2}
                      strokeLinecap="round" strokeLinejoin="round"
                      dangerouslySetInnerHTML={{ __html: getRefChipIconSvgInner(type) }}
                    />
                  )}
                </span>
                <span style={{ display: 'block', lineHeight: 1.3, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingBottom: 1 }}>
                  {label}
                </span>
              </span>
            )
          }
          return (
            <React.Fragment key={i}>
              {part.split('\n').map((line, j, arr) => (
                <React.Fragment key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </React.Fragment>
          )
        })}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// NodeWrapper
// ─────────────────────────────────────────────
function NodeWrapper({
  handles,
  label,
  children,
  nodeId,
  data,
  selected,
}: {
  handles:   HandleDef[]
  label?:    string
  children:  React.ReactNode
  nodeId?:   string
  data?:     CustomNodeData
  selected?: boolean
}) {
  const wrapperRef    = useRef<HTMLDivElement>(null)
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 })
  const hoveredRef    = useRef(false)
  const isHovered     = useCallback(() => hoveredRef.current, [])
  const openEditorId  = useContext(EditorOpenContext)
  const { setNodes }  = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const updateSize = () => {
      setWrapperSize({ width: el.offsetWidth, height: el.offsetHeight })
    }

    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clearError = useCallback(() => {
    if (!nodeId) return
    setNodes(ns => ns.map(n =>
      n.id !== nodeId ? n : { ...n, data: { ...n.data, generationError: undefined } }
    ))
  }, [nodeId, setNodes])

  const { genProgress, genStatusText } = useNodePolling(nodeId, data)
  const normalizedRotation = (((data?.rotation as number | undefined) ?? 0) % 360 + 360) % 360
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270
  const imageNaturalAspect =
    data?.naturalWidth && data?.naturalHeight
      ? (isQuarterTurn
          ? data.naturalHeight / data.naturalWidth
          : data.naturalWidth / data.naturalHeight)
      : undefined
  const imageCurrentAspect =
    data?.width && data?.height
      ? data.width / data.height
      : undefined
  const resizeAspectRatio =
    data?.type === 'image'
      ? (imageNaturalAspect ?? imageCurrentAspect)
      : (data?.type === 'video' && data?.naturalWidth && data?.naturalHeight
          ? data.naturalWidth / data.naturalHeight
          : undefined)

  const baseCornerRadius =
    data?.type === 'template' || data?.type === 'lasso'
      ? 16
      : data?.type === 'text' || data?.type === 'filter' || data?.type === 'seed'
        ? 14
        : 12
  const squareWhenEditing = data?.type === 'image' || data?.type === 'video' || data?.type === 'pdf'
  const cornerRadius = (squareWhenEditing && data?.isEditing) ? 0 : baseCornerRadius
  const effectiveHandles =
    data?.type === 'filter' && data?.filterReversed
      ? handles.map((def) => ({
          semanticSide: def.side,
          visualDef:
            def.side === 'left'
              ? { ...def, side: 'right' as const }
              : def.side === 'right'
                ? { ...def, side: 'left' as const }
                : def,
        }))
      : handles.map((def) => ({ semanticSide: def.side, visualDef: def }))

  // When filter reverses, force ReactFlow to recalculate actual handle anchors.
  // This ensures both edge attachment points and magnetic zones follow the flipped side.
  useEffect(() => {
    if (!nodeId || data?.type !== 'filter') return
    updateNodeInternals(nodeId)
    requestAnimationFrame(() => updateNodeInternals(nodeId))
  }, [nodeId, data?.type, data?.filterReversed, updateNodeInternals])

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => { hoveredRef.current = true  }}
      onMouseLeave={() => { hoveredRef.current = false }}
    >
      {label && (
        <NodeLabel
          label={label}
          nodeId={nodeId}
          nodeType={data?.type}
          selected={selected ?? false}
        />
      )}

      {effectiveHandles.map(({ semanticSide, visualDef }) => (
        <React.Fragment key={visualDef.id}>
          <Handle
            type={sideToHandleType(semanticSide)}
            position={SIDE_TO_POSITION[visualDef.side]}
            id={visualDef.id}
            className={getHandleClassName(visualDef)}
            style={getHandleStyle(visualDef)}
          />
          <MagneticZone def={visualDef} isHovered={isHovered} nodeId={nodeId ?? ''} />
        </React.Fragment>
      ))}
      {nodeId && (
        <ResizeHandle
          nodeId={nodeId}
          isHovered={isHovered}
          aspectRatio={resizeAspectRatio}
          cornerRadius={cornerRadius}
        />
      )}

      {/* Generating overlay — lives here so it persists when editor closes */}
      {(data?.isGenerating || genProgress > 0 || !!genStatusText) && wrapperSize.width > 0 && wrapperSize.height > 0 && (
        <GeneratingOverlay
          cssW={wrapperSize.width}
          cssH={wrapperSize.height}
          borderRadius={cornerRadius}
          progress={genProgress}
          statusText={genStatusText}
        />
      )}

      {/* Error overlay — shown when generation fails */}
      {data?.generationError && !data?.isGenerating && (
        <ErrorOverlay
          message={data.generationError}
          onDismiss={clearError}
        />
      )}

      {/* Inline prompt preview — always shown when enabled; truncated to 1 line while editor is open */}
      {data?.showPromptInline && data?.prompt?.trim() && (
        <InlinePromptPreview prompt={data.prompt} truncate={nodeId === openEditorId} />
      )}

      {children}
    </div>
  )
}

// ─────────────────────────────────────────────
// ReactFlow node components
// ─────────────────────────────────────────────

// CustomNode — text / image / video / filter / seed
const CustomNodeInner = ({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const mod = MODULE_BY_ID[data.type]
  if (!mod?.NodeUI) return null

  return (
    <NodeWrapper handles={(mod.handles ?? []) as HandleDef[]} label={data.label} nodeId={id} data={data} selected={selected}>
      {/* Filter node handles its own connected sources via useReactFlow */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <mod.NodeUI data={data} selected={selected} nodeId={id} />
    </NodeWrapper>
  )
}
export const CustomNode = memo(CustomNodeInner)

// TemplateNode
const TemplateNodeInner = ({ id, data, selected }: NodeProps<CustomNodeData>) => (
  <NodeWrapper handles={Template.handles as HandleDef[]} label={data.label} nodeId={id} data={data} selected={selected}>
    <Template.NodeUI data={data} selected={selected} />
  </NodeWrapper>
)
export const TemplateNode = memo(TemplateNodeInner)

// LassoNode — no external handles (pure container)
const LassoNodeInner = ({ id, data, selected }: NodeProps<CustomNodeData>) => (
  <NodeWrapper handles={[]} label={data.label} nodeId={id} data={data} selected={selected}>
    <Lasso.NodeUI data={data} selected={selected} />
  </NodeWrapper>
)
export const LassoNode = memo(LassoNodeInner)

// StandardNode — KG entity nodes
const StandardNodeInner = ({ id, data, selected }: NodeProps<CustomNodeData>) => {
  if (!data) return null
  return (
    <NodeWrapper handles={Standard.handles as HandleDef[]} label={(data as any).name || data.label} nodeId={id} data={data} selected={selected}>
      <Standard.NodeUI data={data} selected={selected} />
    </NodeWrapper>
  )
}
export const StandardNode = memo(StandardNodeInner)

// GhostNode — invisible anchor for quick-add edge preview
const GhostNodeInner = () => (
  <div style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}>
    <Handle type="source" position={Position.Left}   id="left"   style={{ opacity: 0 }} />
    <Handle type="source" position={Position.Right}  id="right"  style={{ opacity: 0 }} />
    <Handle type="source" position={Position.Top}    id="top"    style={{ opacity: 0 }} />
    <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
    <Handle type="target" position={Position.Left}   id="left"   style={{ opacity: 0 }} />
    <Handle type="target" position={Position.Right}  id="right"  style={{ opacity: 0 }} />
    <Handle type="target" position={Position.Top}    id="top"    style={{ opacity: 0 }} />
    <Handle type="target" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
  </div>
)
export const GhostNode = memo(GhostNodeInner)

export const nodeTypes = {
  StandardNode,
  CustomNode,
  TemplateNode,
  LassoNode,
  GhostNode,
}
