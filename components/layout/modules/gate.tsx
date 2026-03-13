"use client"

import React, { memo } from 'react'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Filter } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { GenerateTextPanel } from '@/components/layout/node_editor/_panels'

export const meta = {
  id: 'gate',
  name: 'Gate',
  description: 'Filter & route signals by condition',
  icon: Filter,
  color: 'text-amber-500',
  bg: 'bg-amber-50',
  border: 'hover:border-amber-200',
  opensEditor: true,
  panelTitle: 'Gate Condition',
}

export const defaultData: Partial<CustomNodeData> = {
  type:  'gate',
  label: 'Gate',
  width:  200,
  height: 112,
}

// Ref at 30%, In at 70%, Out at 50% right.
// Node is 200×112 — 30% = 33.6px, 70% = 78.4px.
export const handles: HandleDef[] = [
  { id: 'ref', side: 'left',  offsetPercent: 30 },
  { id: 'in', side: 'left',  offsetPercent: 70 },
  { id: 'out', side: 'right', offsetPercent: 50 },
]

// ─────────────────────────────────────────────
// Port rail — the narrow left strip with two labeled connection points.
// Uses absolute positioning to sit exactly at the handle y positions.
// ─────────────────────────────────────────────
function PortRail({ h }: { h: number }) {
  const refY = h * 0.30  // matches handle offsetPercent: 30
  const inY  = h * 0.70  // matches handle offsetPercent: 70

  return (
    <div
      className="absolute left-0 top-0 bottom-0 flex flex-col"
      style={{ width: 38 }}
    >
      {/* Amber background strip */}
      <div className="absolute inset-0 rounded-l-xl bg-amber-50/70 border-r border-amber-100/80" />

      {/* REF port */}
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

      {/* Thin connector line between the two ports */}
      <div
        className="absolute left-[10px] w-px bg-amber-200/50"
        style={{ top: refY, height: inY - refY }}
      />

      {/* IN port */}
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
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  // Use dimensions from data (set by container) or fall back to defaults
  const W = data.width  ?? 200
  const H = data.height ?? 112

  const hasCondition = !!data.content?.trim()
  const conditionText = data.content?.replace(/<[^>]*>/g, '').trim() ?? ''

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'bg-white/80 border border-slate-200/80',
        'transition-all duration-200',
        selected
          ? 'border-amber-300/80'
          : 'shadow-[0_1px_4px_rgba(0,0,0,0.06)]',
        data.isEditing && 'border-amber-400/70',
      )}
      style={{ width: W, height: H, borderRadius: 14 }}
    >
      <PortRail h={H} />

      {/* Main content area */}
      <div
        className="absolute inset-0 flex flex-col"
        style={{ paddingLeft: 46, paddingRight: 12, paddingTop: 10, paddingBottom: 10 }}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-2 shrink-0">
          <Filter size={9} className="text-amber-400/80" strokeWidth={2.5} />
          <span className="text-[9px] font-bold tracking-widest text-slate-400/70 uppercase select-none">
            Gate
          </span>
        </div>

        {/* Condition */}
        <div className="flex-1 flex items-center min-h-0">
          {hasCondition ? (
            <p className="text-[10.5px] leading-snug text-slate-600/90 line-clamp-3 font-medium">
              {conditionText}
            </p>
          ) : (
            <p className="text-[10px] text-slate-300/80 italic leading-snug select-none">
              Double-click to set condition…
            </p>
          )}
        </div>
      </div>

      {/* Right output tick — subtle indicator that something exits here */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] rounded-l-full"
        style={{
          height: 20,
          background: selected
            ? 'rgba(251,191,36,0.45)'
            : 'rgba(203,213,225,0.6)',
          transition: 'background 200ms',
        }}
      />
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'GateNode'

export function ModalContent({ data, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <GenerateTextPanel
      data={data as CustomNodeData}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
      placeholder={{
        auto:   'Set the gate condition — the node will evaluate inputs automatically…',
        manual: 'Describe the filter condition (outputs JSON)…',
      }}
    />
  )
}
