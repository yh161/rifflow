"use client"

import React, { memo, useRef, useCallback, useState, useEffect } from 'react'
import { NodeProps } from 'reactflow'
import { Handle, Position, useReactFlow } from 'reactflow'
import { cn } from '@/lib/utils'
import type { CustomNodeData, ModuleModalProps } from './_types'
import { HandleDef, MagneticZone, ResizeHandle, SIDE_TO_POSITION, getHandleStyle, getHandleClassName, sideToHandleType } from './_handle'
import { GeneratingOverlay } from './_overlay'
import { useNodePolling }    from './_polling'

import * as Standard from './standard'
import * as Text     from './text'
import * as Image    from './image'
import * as Video    from './video'
import * as Filter    from './filter'
import * as Template  from './template'
import * as Seed      from './seed'
import * as Lasso    from './lasso'   // ← new

// ─────────────────────────────────────────────
// Module registry
// ─────────────────────────────────────────────
export interface ModuleDefinition {
  meta: {
    id: string; name: string; description: string
    icon: React.ComponentType<any>
    color: string; bg: string; border: string
    isStandard?: boolean
    panelTitle?: string
    opensEditor?: boolean
  }
  defaultData:  Record<string, any>
  handles:      HandleDef[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NodeUI:       React.ComponentType<{ data: any; selected?: boolean; nodeId?: string }>
  ModalContent: React.ComponentType<ModuleModalProps>
}

export const MODULES: ModuleDefinition[] = [
  Standard, Text, Image, Video, Filter, Template, Seed, Lasso,
] as any[]

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
      // Prevent triggering node drag when interacting with the title
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
  data?:     any
  selected?: boolean
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hoveredRef = useRef(false)
  const isHovered  = useCallback(() => hoveredRef.current, [])

  const { genProgress } = useNodePolling(nodeId, data)

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

      {handles.map((def) => (
        <React.Fragment key={def.id}>
          <Handle
            type={sideToHandleType(def.side)}
            position={SIDE_TO_POSITION[def.side]}
            id={def.id}
            className={getHandleClassName(def)}
            style={getHandleStyle(def)}
          />
          <MagneticZone def={def} isHovered={isHovered} nodeId={nodeId ?? ''} />
        </React.Fragment>
      ))}
      {nodeId && (
        <ResizeHandle
          nodeId={nodeId}
          isHovered={isHovered}
          aspectRatio={
            (data?.type === 'image' || data?.type === 'video') && data?.naturalWidth && data?.naturalHeight
              ? data.naturalWidth / data.naturalHeight
              : undefined
          }
        />
      )}

      {/* Generating overlay — lives here so it persists when editor closes */}
      {data?.isGenerating && wrapperRef.current && (
        <GeneratingOverlay
          cssW={wrapperRef.current.offsetWidth}
          cssH={wrapperRef.current.offsetHeight}
          progress={genProgress}
        />
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
const TemplateNodeInner = ({ id, data, selected }: NodeProps<any>) => (
  <NodeWrapper handles={Template.handles as HandleDef[]} label={data.label} nodeId={id} data={data} selected={selected}>
    <Template.NodeUI data={data} selected={selected} />
  </NodeWrapper>
)
export const TemplateNode = memo(TemplateNodeInner)

// LassoNode — no external handles (pure container)
const LassoNodeInner = ({ id, data, selected }: NodeProps<any>) => (
  <NodeWrapper handles={[]} label={data.label} nodeId={id} data={data} selected={selected}>
    <Lasso.NodeUI data={data} selected={selected} />
  </NodeWrapper>
)
export const LassoNode = memo(LassoNodeInner)

// StandardNode — KG entity nodes
const StandardNodeInner = ({ id, data, selected }: NodeProps<any>) => {
  if (!data) return null
  return (
    <NodeWrapper handles={Standard.handles as HandleDef[]} label={data.name || data.label} nodeId={id} data={data} selected={selected}>
      <Standard.NodeUI data={data} selected={selected} />
    </NodeWrapper>
  )
}
export const StandardNode = memo(StandardNodeInner)

// GhostNode — invisible anchor for quick-add edge preview
const GhostNodeInner = () => (
  <div style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}>
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
