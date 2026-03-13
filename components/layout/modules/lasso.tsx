"use client"

import React, { memo } from 'react'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Lasso } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'

export const meta = {
  id:          'lasso',
  name:        'Lasso',
  description: 'Select and execute multiple nodes as a workflow',
  icon:        Lasso,
  color:       'text-amber-500',
  bg:          'bg-amber-50',
  border:      'hover:border-amber-200',
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
export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const w = data.width  ?? 400
  const h = data.height ?? 300

  return (
    <div
      className={cn(
        'relative border-2 border-dashed transition-colors duration-200',
        selected
          ? 'border-amber-400/80 bg-amber-50/25'
          : 'border-amber-200/50 bg-amber-50/10',
        data.isEditing && '!border-amber-400/90',
      )}
      style={{ width: w, height: h, borderRadius: 16 }}
    >
      {/* Drop hint */}
      <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
        <span className="text-[10px] text-amber-200/70 select-none">
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