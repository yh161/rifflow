"use client"

import React, { memo, useRef, useEffect } from 'react'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Type } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { GenerateTextPanel } from '@/components/layout/node_editor/_panels'

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
  { id: 'in', side: 'left'  },
  { id: 'out', side: 'right' },
]

/**
 * NodeUI — renders text node on the canvas.
 *
 * Modes:
 *  - Normal  (isEditing = false): read-only, dangerouslySetInnerHTML
 *  - Editing (isEditing = true):  contentEditable div, syncs via onDataChange
 *
 * When editing:
 *  - Content is initialised from data.content on mode-entry (useEffect).
 *  - Every keystroke calls data.onDataChange({ content: innerHTML }).
 *  - The "nodrag nopan nowheel" classes let ReactFlow know not to intercept
 *    pointer/wheel events inside the editable area, enabling normal text
 *    selection and scrolling behaviour.
 *  - Formatting commands from the TextFormatBar in node_editor.tsx work via
 *    document.execCommand on the active selection — no extra wiring needed.
 */
export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const editorRef      = useRef<HTMLDivElement>(null)
  const wasEditing     = useRef(false)
  const onChangeRef    = useRef(data.onDataChange)
  onChangeRef.current  = data.onDataChange
  const latestContent  = useRef(data.content ?? "")

  useEffect(() => {
    const entering = !!data.isEditing && !wasEditing.current

    if (entering && editorRef.current) {
      latestContent.current = data.content || ""
      editorRef.current.innerHTML = latestContent.current
      requestAnimationFrame(() => {
        const el = editorRef.current
        if (!el) return
        el.focus()
        const range = document.createRange()
        const sel   = window.getSelection()
        range.selectNodeContents(el)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
      })
    }

    wasEditing.current = !!data.isEditing
  }, [data.isEditing])

  return (
    <div className={cn(
      "w-[180px] h-[180px] rounded-xl",
      "bg-white/70 border border-slate-400/60",
      "p-3 flex flex-col transition-all duration-200 overflow-hidden",
      selected && "ring-2 ring-blue-300 ring-offset-1 border-blue-200",
      data.isEditing && "ring-2 ring-blue-200 ring-offset-1 border-blue-200",
    )}>
      <div className="flex-1 overflow-hidden text-xs text-slate-600 leading-relaxed">
        {data.isEditing ? (
          /*
           * Editing mode — React hands off DOM control to the browser.
           * We init innerHTML via the effect above and read it back on every input.
           * nodrag / nopan / nowheel prevent ReactFlow from swallowing events.
           */
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              const html = (e.currentTarget as HTMLDivElement).innerHTML
              latestContent.current = html
              onChangeRef.current?.({ content: html })
            }}
            onBlur={() => {
              onChangeRef.current?.({ content: latestContent.current })
            }}
            className={cn(
              "nodrag nopan nowheel",
              "h-full outline-none overflow-y-auto cursor-text",
              "[&_b]:font-bold [&_i]:italic [&_u]:underline",
            )}
            style={{ textAlign: data.align || 'left' }}
          />
        ) : data.content ? (
          /*
           * Read-only mode — React controls the DOM via dangerouslySetInnerHTML.
           * Plain text strings also render safely.
           */
          <div
            dangerouslySetInnerHTML={{ __html: data.content }}
            style={{ textAlign: data.align || 'left' }}
            className="h-full overflow-hidden [&_b]:font-bold [&_i]:italic [&_u]:underline"
          />
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

/** ModalContent — text generate panel */
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
