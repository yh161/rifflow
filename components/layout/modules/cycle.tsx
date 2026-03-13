"use client"

import React, { memo, useRef, useCallback } from 'react'
import { NodeProps, Handle, Position } from 'reactflow'
import { cn } from '@/lib/utils'
import { Repeat2 } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { MagneticZone, SIDE_TO_POSITION, getHandleStyle, getHandleClassName, sideToHandleType } from './_handle'
import { CyclePanel } from '../node_editor/_panels'

export const meta = {
  id:          'cycle',
  name:        'Cycle',
  description: 'Self-oscillating container — nodes loop back through the pipeline',
  icon:        Repeat2,
  color:       'text-violet-500',
  bg:          'bg-violet-50',
  border:      'hover:border-violet-200',
  panelTitle:  'Cycle',
  opensEditor: true,
}

export const defaultData: Partial<CustomNodeData> = {
  type:            'cycle',
  label:           'Cycle',
  width:           520,
  height:          400,
  instanceCount:   0,
  currentInstance: -1,
}

// No external handles — cycle's handles are rendered inside NodeUI as pseudo nodes
export const handles: HandleDef[] = []

// ─────────────────────────────────────────────
// PseudoNode — invisible node with a single handle
// Used for exit and re-enter points inside the cycle container
// ─────────────────────────────────────────────
const PseudoNode = ({
  id,
  type,
  position,
  label,
  selected,
}: {
  id: string
  type: 'source' | 'target'
  position: 'left' | 'right'
  label: string
  selected?: boolean
}) => {
  const hoveredRef = useRef(false)
  const isHovered = useCallback(() => hoveredRef.current, [])

  // Handle position: exit on right border has Left handle, re-enter on left border has Right handle
  const handlePosition = position === 'left' ? Position.Right : Position.Left
  const handleSide: HandleDef['side'] = position === 'left' ? 'right' : 'left'

  // HandleDef for MagneticZone - follows the same pattern as other nodes
  const handleDef: HandleDef = {
    id: id,
    side: handleSide,
    offsetPercent: 50,
  }

  // Visual position within the container
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    [position]: 0,
    top: '50%',
    transform: `translate(${position === 'left' ? '-50%' : '50%'}, -50%)`,
    width: 1,
    height: 1,
    zIndex: 30,
  }

  // Label position
  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    [position === 'left' ? 'left' : 'right']: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    userSelect: 'none',
  }

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => { hoveredRef.current = true }}
      onMouseLeave={() => { hoveredRef.current = false }}
    >
      {/* The actual ReactFlow Handle - same pattern as NodeWrapper */}
      <Handle
        type={type}
        position={handlePosition}
        id={id}
        className={getHandleClassName(handleDef)}
        style={getHandleStyle(handleDef)}
      />
      
      {/* MagneticZone - renders the magnetic cross icon */}
      <MagneticZone def={handleDef} isHovered={isHovered} />

      {/* Visual indicator dot */}
      <div
        style={{
          position: 'absolute',
          [position]: -5,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: selected ? 'rgba(124,58,237,0.45)' : 'rgba(124,58,237,0.25)',
          border: `1.5px solid ${selected ? 'rgba(124,58,237,0.7)' : 'rgba(124,58,237,0.45)'}`,
          transition: 'background 200ms, border-color 200ms',
          pointerEvents: 'none',
        }}
      />

      {/* Label */}
      <div style={labelStyle}>
        <span style={{ fontSize: 9, color: 'rgba(124,58,237,0.5)', letterSpacing: '0.02em' }}>
          {label}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// NodeUI — container with two pseudo nodes
// ─────────────────────────────────────────────
export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const w = data.width  ?? 520
  const h = data.height ?? 400

  const instanceCount   = data.instanceCount ?? 0
  const currentInstance = data.currentInstance ?? -1
  const isTemplate      = currentInstance === -1

  return (
    <div
      className={cn(
        'relative border-2 border-dashed transition-colors duration-200',
        selected
          ? 'border-violet-400/80 bg-violet-50/25'
          : 'border-violet-200/50 bg-violet-50/10',
        data.isEditing && '!border-violet-400/90',
      )}
      style={{ width: w, height: h, borderRadius: 16 }}
    >
      {/* ── Pseudo nodes ─────────────────────────────────────
          Two invisible "bridge" nodes that allow internal nodes to connect
          to the cycle container's edge points.
          
          - re-enter (source): LEFT border, handle on RIGHT side
            → Internal nodes can pull from here (connect to this source)
          - exit (target): RIGHT border, handle on LEFT side
            → Internal nodes can push to here (connect to this target)
      ──────────────────────────────────────────────────── */}

      {/* re-enter pseudo node — on LEFT border, source handle pointing RIGHT */}
      <PseudoNode
        id="cycle-out"
        type="source"
        position="left"
        label="↻ re-enter"
        selected={selected}
      />

      {/* exit pseudo node — on RIGHT border, target handle pointing LEFT */}
      <PseudoNode
        id="cycle-in"
        type="target"
        position="right"
        label="exit ↵"
        selected={selected}
      />

      {/* Instance badge */}
      {!isTemplate && instanceCount > 0 && (
        <div className="absolute top-2 right-3 flex items-center gap-1 pointer-events-none">
          <div className="px-2 py-0.5 rounded-full bg-violet-100/80 border border-violet-200/60">
            <span className="text-[10px] font-semibold text-violet-500 tabular-nums">
              {currentInstance + 1}
              <span className="text-violet-300"> / {instanceCount}</span>
            </span>
          </div>
        </div>
      )}

      {/* Drop hint */}
      {isTemplate && (
        <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
          <span className="text-[10px] text-violet-200/70 select-none">
            drop nodes here · connect to handles · set cycles in panel
          </span>
        </div>
      )}
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'CycleNode'

export function ModalContent({ data, onUpdate, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <CyclePanel
      data={data as CustomNodeData}
      onDataChange={onUpdate as (u: Partial<CustomNodeData>) => void}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
    />
  )
}
