"use client"

import React, { memo, useRef, useEffect, useCallback } from 'react'
import { NodeProps } from 'reactflow'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CustomNodeData } from './_types'
import type { HandleDef } from './_handle'

export const meta = {
  id:          'seed',
  name:        'Seed',
  description: 'Dynamic seed content — generated fresh each loop iteration',
  icon:        Sparkles,
  color:       'text-violet-500',
  bg:          'bg-violet-50',
  border:      'hover:border-violet-200',
  opensEditor: true,
}

export const defaultData: Partial<CustomNodeData> = {
  type:     'seed',
  label:    'Seed',
  content:  '',
  isSeed:   true,
  isLocked: true,
  width:    180,
  height:   180,
}

// Seed only outputs — it lives inside a loop and feeds sibling nodes.
export const handles: HandleDef[] = [
  { id: 'out', side: 'right' },
]

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
  const editorRef  = useRef<HTMLDivElement>(null)
  const wasEditing = useRef(false)
  const onChangeRef = useRef(data.onDataChange)
  onChangeRef.current = data.onDataChange

  useEffect(() => {
    const entering = !!data.isEditing && !wasEditing.current
    const leaving  = !data.isEditing &&  wasEditing.current
    if (entering && editorRef.current) {
      editorRef.current.innerHTML = data.content || ''
      requestAnimationFrame(() => editorRef.current?.focus())
    }
    if (leaving && editorRef.current) {
      onChangeRef.current?.({ content: editorRef.current.innerHTML })
    }
    wasEditing.current = !!data.isEditing
  }, [data.isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  const w = data.width  ?? 180
  const h = data.height ?? 180

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden transition-all duration-150',
        'bg-violet-50/80 border border-violet-200/60',
        selected       && 'border-violet-400/70 bg-violet-50/90',
        data.isEditing && '!border-violet-500 !rounded-none',
      )}
      style={{ width: w, height: h, borderRadius: data.isEditing ? 0 : 12 }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-violet-100/80 bg-violet-100/50 shrink-0">
        <Sparkles size={10} className="text-violet-400" strokeWidth={2} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Seed</span>
      </div>

      {/* Content */}
      <div className="flex-1 px-2.5 py-2 min-h-0 overflow-hidden">
        {data.isEditing ? (
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) =>
              onChangeRef.current?.({ content: (e.currentTarget as HTMLDivElement).innerHTML })
            }
            className="nodrag nopan nowheel w-full h-full outline-none text-[11px] text-violet-700 leading-relaxed cursor-text"
          />
        ) : data.content ? (
          <div
            dangerouslySetInnerHTML={{ __html: data.content }}
            className="text-[11px] text-violet-600/80 leading-relaxed line-clamp-5"
          />
        ) : (
          <span className="italic text-violet-300/60 text-[11px]">
            Describe what varies each iteration…
          </span>
        )}
      </div>
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'SeedNode'

export function ModalContent() { return null }