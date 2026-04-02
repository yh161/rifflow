"use client"

import React, { memo } from 'react'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Layers } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from '../_types'
import type { HandleDef } from '../_handle'
import { TemplatePanel } from '@/components/layout/node_editor/_panels'

export const meta = {
  id:          'template',
  name:        'Template',
  description: 'Expand a subgraph into multiple parallel instances with LLM-driven variation',
  icon:        Layers,
  color:       'text-indigo-500',
  bg:          'bg-indigo-50',
  border:      'hover:border-indigo-200',
  panelTitle:  'Template',
  opensEditor: true,
  category:    'Logic',
  doneColor:   'rgba(99, 102, 241, 0.55)',
}

export const defaultData: Partial<CustomNodeData> = {
  type:            'template',
  label:           'Template',
  width:           520,
  height:          400,
  templateCount:   undefined,
  instanceCount:   0,
  currentInstance: -1,
}

// Template output = the nodes inside it. No right handle needed.
export const handles: HandleDef[] = [
  { id: 'in', side: 'left' },
]

// ─────────────────────────────────────────────
// NodeUI — pure container, all controls live in NodeEditor action bar
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
          ? 'border-indigo-400/80 bg-indigo-50/25'
          : 'border-indigo-200/50 bg-indigo-50/10',
        data.isEditing            && '!border-indigo-400/90',
        data.isDragHovered        && '!border-indigo-500/90 !bg-indigo-100/30',
        // Eject tension: border brightens as child node is pushed toward the wall
        data.isDragEjecting && !data.isDragEjectingReady && '!border-indigo-400/80',
        // Eject ready: threshold crossed — border fully lit, signals "release to pop out"
        data.isDragEjectingReady  && '!border-indigo-600 !bg-indigo-100/30',
      )}
      style={{ width: w, height: h, borderRadius: 16 }}
    >
      {/* Left border accent */}
      <div
        className="absolute pointer-events-none"
        style={{
          left:         -2,
          top:          '50%',
          transform:    'translateY(-50%)',
          width:        5,
          height:       '18%',
          borderRadius: '0 2px 2px 0',
          background:   selected ? 'rgba(99,102,241,0.55)' : 'rgba(99,102,241,0.28)',
          boxShadow:    selected ? '0 0 6px rgba(99,102,241,0.35)' : '0 0 4px rgba(99,102,241,0.18)',
          transition:   'background 200ms, box-shadow 200ms',
        }}
      />

      {/* Instance badge — shows when in instance view */}
      {!isTemplate && instanceCount > 0 && (
        <div className="absolute right-3 z-[200] pointer-events-none" style={{ top: 6 }}>
          <div className="h-5 px-2 rounded-full bg-indigo-100/85 border border-indigo-200/70 inline-flex items-center leading-none">
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-500 tabular-nums leading-none">
              <span>{currentInstance + 1}</span>
              <span className="text-indigo-300">/</span>
              <span className="text-indigo-300">{instanceCount}</span>
            </span>
          </div>
        </div>
      )}

      {/* Drop hint — only in template view */}
      {isTemplate && (
        <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
          <span className="text-[10px] text-indigo-200/70 select-none">
            drop nodes here · set prompt in panel below
          </span>
        </div>
      )}
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'TemplateNode'

// ─────────────────────────────────────────────
// ModalContent — wired to TemplatePanel
// ─────────────────────────────────────────────
export function ModalContent({ data, nodeId, onUpdate, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <TemplatePanel
      data={data as CustomNodeData}
      nodeId={nodeId}
      onDataChange={onUpdate as (u: Partial<CustomNodeData>) => void}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
    />
  )
}
export { resultHandler } from './resultHandler'
export { ActionBarContent } from './actionBar'
