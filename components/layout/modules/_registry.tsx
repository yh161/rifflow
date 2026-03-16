"use client"

import React, { memo, useRef, useCallback } from 'react'
import { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import type { CustomNodeData, ModuleModalProps } from './_types'
import { HandleDef, MagneticZone, ResizeHandle, SIDE_TO_POSITION, getHandleStyle, getHandleClassName, sideToHandleType } from './_handle'

import * as Standard from './standard'
import * as Text     from './text'
import * as Image    from './image'
import * as Video    from './video'
import * as Gate     from './gate'
import * as Batch    from './batch'   // ← was Loop
import * as Cycle    from './cycle'   // ← new
import * as Seed     from './seed'
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
  NodeUI:       React.ComponentType<{ data: any; selected?: boolean }>
  ModalContent: React.ComponentType<ModuleModalProps>
}

export const MODULES: ModuleDefinition[] = [
  Standard, Text, Image, Video, Gate, Batch, Cycle, Seed, Lasso,
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
// NodeWrapper
// ─────────────────────────────────────────────
function NodeWrapper({
  handles,
  label,
  children,
  nodeId,
}: {
  handles:  HandleDef[]
  label?:   string
  children: React.ReactNode
  nodeId?:  string
}) {
  const hoveredRef = useRef(false)
  const isHovered  = useCallback(() => hoveredRef.current, [])

  return (
    <div
      className="relative"
      onMouseEnter={() => { hoveredRef.current = true  }}
      onMouseLeave={() => { hoveredRef.current = false }}
    >
      {label && (
        <div className="absolute pointer-events-none" style={{ bottom: '100%', left: 3, paddingBottom: 1 }}>
          <span className="text-[11.5px] font-medium text-slate-400/80 tracking-tight whitespace-nowrap select-none">
            {label}
          </span>
        </div>
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
          <MagneticZone def={def} isHovered={isHovered} />
        </React.Fragment>
      ))}
      {nodeId && <ResizeHandle nodeId={nodeId} isHovered={isHovered} />}
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────
// ReactFlow node components
// ─────────────────────────────────────────────

// CustomNode — text / image / video / gate / seed
const CustomNodeInner = ({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const mod = MODULE_BY_ID[data.type]
  if (!mod?.NodeUI) return null
  return (
    <NodeWrapper handles={(mod.handles ?? []) as HandleDef[]} label={data.label} nodeId={id}>
      <mod.NodeUI data={data} selected={selected} />
    </NodeWrapper>
  )
}
export const CustomNode = memo(CustomNodeInner)

// BatchNode — was LoopNode
const BatchNodeInner = ({ id, data, selected }: NodeProps<any>) => (
  <NodeWrapper handles={Batch.handles as HandleDef[]} nodeId={id}>
    <Batch.NodeUI data={data} selected={selected} />
  </NodeWrapper>
)
export const BatchNode = memo(BatchNodeInner)

// CycleNode — no external handles (handles rendered inside NodeUI)
const CycleNodeInner = ({ id, data, selected }: NodeProps<any>) => (
  <NodeWrapper handles={[]} nodeId={id}>
    <Cycle.NodeUI data={data} selected={selected} />
  </NodeWrapper>
)
export const CycleNode = memo(CycleNodeInner)

// LassoNode — no external handles (pure container)
const LassoNodeInner = ({ id, data, selected }: NodeProps<any>) => (
  <NodeWrapper handles={[]} nodeId={id}>
    <Lasso.NodeUI data={data} selected={selected} />
  </NodeWrapper>
)
export const LassoNode = memo(LassoNodeInner)

// StandardNode — KG entity nodes
const StandardNodeInner = ({ id, data, selected }: NodeProps<any>) => {
  if (!data) return null
  return (
    <NodeWrapper handles={Standard.handles as HandleDef[]} label={data.name || data.label} nodeId={id}>
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
  BatchNode,
  CycleNode,
  LassoNode,
  GhostNode,
}
