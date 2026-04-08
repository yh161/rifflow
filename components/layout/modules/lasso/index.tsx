"use client"

import React, { memo } from 'react'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Lasso } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from '../_types'
import type { HandleDef } from '../_handle'

export const meta = {
  id:          'lasso',
  name:        'Lasso',
  description: 'Select and execute multiple nodes as a workflow',
  icon:        Lasso,
  color:       'text-slate-400',
  bg:          'bg-slate-50',
  border:      'hover:border-slate-300',
  panelTitle:  'Lasso',
  opensEditor: true,
}

export const defaultData: Partial<CustomNodeData> = {
  type:            'lasso',
  label:           'Lasso',
  width:           400,
  height:          300,
  instanceCount:   0,
  currentInstance: -1,
}

// Lasso has no external handles — it's a pure container
export const handles: HandleDef[] = []

// ─────────────────────────────────────────────
// NodeUI — simple dashed container
// ─────────────────────────────────────────────
// Convert hex color to rgba with given alpha
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const w = data.width  ?? 400
  const h = data.height ?? 300
  const bgColor = data.lassoBgColor as string | undefined

  // Derive border color from lassoBgColor when set
  const customBorderColor = bgColor ? hexToRgba(bgColor, 0.5) : undefined

  return (
    <div
      className={cn(
        'relative border-2 border-dashed transition-colors duration-200',
        !bgColor && (
          selected
            ? 'border-slate-500/80 bg-slate-50/30'
            : 'border-slate-300/50 bg-slate-50/10'
        ),
        !bgColor && data.isEditing            && '!border-slate-500/90',
        !bgColor && data.isDragHovered        && '!border-slate-500/90 !bg-slate-100/40',
        !bgColor && data.isDragEjecting && !data.isDragEjectingReady && '!border-slate-400/80',
        !bgColor && data.isDragEjectingReady  && '!border-slate-600 !bg-slate-100/35',
      )}
      style={{
        width: w,
        height: h,
        borderRadius: 16,
        // When custom color is set, apply it directly
        ...(bgColor && {
          borderColor: customBorderColor,
          backgroundColor: hexToRgba(bgColor, 0.12),
        }),
      }}
    >
      {/* Custom color background tint overlay — stronger when selected */}
      {bgColor && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-200"
          style={{
            borderRadius: 14,
            backgroundColor: hexToRgba(bgColor, selected ? 0.03 : 0),
          }}
        />
      )}

      {/* Drop hint */}
      <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
        <span
          className="text-[10px] select-none"
          style={{ color: bgColor ? hexToRgba(bgColor, 0.5) : 'rgba(148,163,184,0.7)' }}
        >
          drop nodes here · click execute to run
        </span>
      </div>
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'LassoNode'

// ─────────────────────────────────────────────
// ModalContent — minimal panel (no slider needed)
// ─────────────────────────────────────────────
export function ModalContent({ data }: ModuleModalProps) {
  return (
    <div className="p-4 text-sm text-slate-600">
      <p className="mb-2">This container executes selected nodes as a workflow.</p>
      <p className="text-slate-400 text-xs">
        Drag nodes inside, then use the action bar to execute.
      </p>
    </div>
  )
}
export { ActionBarContent } from './actionBar'