"use client"

import React, { memo, useRef, useEffect, useCallback } from 'react'
import { NodeProps } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Type } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { GenerateTextPanel } from '@/components/layout/node_editor/_panels'
import { registerTextarea } from './_markdown_insert'

export const meta = {
  id: 'text',
  name: 'Text',
  description: 'Documentation & notes',
  icon: Type,
  color: 'text-blue-500',
  bg: 'bg-blue-50',
  border: 'hover:border-blue-200',
  opensEditor: true,
  panelTitle: 'Generate Text',
}

export const defaultData: Partial<CustomNodeData> = {
  type: 'text',
  label: 'New Text',
  content: '',
  align: 'left',
}

export const handles: HandleDef[] = [
  { id: 'in',  side: 'left'  },
  { id: 'out', side: 'right' },
]

export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const onChangeRef    = useRef(data.onDataChange)
  onChangeRef.current  = data.onDataChange

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (data.isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [data.isEditing])

  const handleFocus = useCallback(() => {
    registerTextarea(textareaRef.current)
  }, [])

  const handleBlur = useCallback(() => {
    registerTextarea(null)
  }, [])

  const w = data.width  ?? 180
  const h = data.height ?? 180

  return (
    <div
      className={cn(
        "rounded-xl",
        "bg-white/70 border border-slate-400/60",
        "p-3 flex flex-col overflow-hidden",
        selected && "ring-2 ring-blue-300 ring-offset-1 border-blue-200",
        data.isEditing && "ring-2 ring-blue-200 ring-offset-1 border-blue-200",
      )}
      style={{ width: w, height: h }}
    >
      <div className="flex-1 overflow-hidden text-xs text-slate-600 leading-relaxed min-h-0">
        {data.isEditing ? (
          <textarea
            ref={textareaRef}
            className={cn(
              "nodrag nopan nowheel",
              "w-full h-full resize-none outline-none bg-transparent",
              "text-xs text-slate-700 leading-relaxed font-mono",
              "placeholder:text-slate-300",
            )}
            placeholder="Write markdown here…"
            defaultValue={data.content ?? ''}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onInput={(e) => {
              onChangeRef.current?.({ content: (e.currentTarget as HTMLTextAreaElement).value })
            }}
          />
        ) : data.content ? (
          <div className="h-full overflow-y-auto
            [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-1 [&_h1]:text-slate-800
            [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-0.5 [&_h2]:mb-0.5 [&_h2]:text-slate-800
            [&_h3]:text-xs [&_h3]:font-medium [&_h3]:mt-0.5 [&_h3]:mb-0 [&_h3]:text-slate-700
            [&_p]:my-0.5 [&_p]:leading-relaxed
            [&_ul]:my-0.5 [&_ul]:pl-4 [&_ul]:list-disc [&_li]:my-0
            [&_ol]:my-0.5 [&_ol]:pl-4 [&_ol]:list-decimal
            [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_blockquote]:text-slate-500 [&_blockquote]:my-0.5 [&_blockquote]:italic
            [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px] [&_code]:font-mono [&_code]:text-slate-600
            [&_pre]:bg-slate-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-0.5 [&_pre_code]:bg-transparent [&_pre_code]:px-0
            [&_strong]:font-semibold [&_em]:italic
            [&_a]:text-blue-500 [&_a]:underline
            [&_hr]:border-slate-200 [&_hr]:my-1
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {data.content}
            </ReactMarkdown>
          </div>
        ) : (
          <span className="italic text-slate-300 text-[11px]">
            Double-click to edit…
          </span>
        )}
      </div>
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'TextNode'

export function ModalContent({ data, nodeId, onUpdate, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <GenerateTextPanel
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
