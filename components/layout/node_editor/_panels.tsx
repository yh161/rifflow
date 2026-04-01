"use client"

import React, { useState, useRef, useLayoutEffect, useCallback, useEffect, useImperativeHandle, useMemo } from "react"
import { creditLabel, calculateCreditCost } from "@/lib/credits"
import { useReactFlow, useNodes } from "reactflow"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Node as TiptapNode, mergeAttributes, type JSONContent, type Editor as TiptapEditor } from "@tiptap/core"
import type { DOMOutputSpec } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { Sparkles, Zap, RefreshCw, Square, Bot, Hand, ChevronUp, Infinity, Hash, StickyNote, Lock, SlidersHorizontal, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import * as SliderPrimitive from "@radix-ui/react-slider"
import type { CustomNodeData, NodeMode } from "../modules/_types"
import { UpstreamReference } from "./_upstream_reference"
import { getRefChipIconDataUri } from "./_ref_chip_icon"
import { TEXT_MODELS, IMAGE_MODELS, VIDEO_MODELS, type ModelDef } from "@/lib/models"
import { getTypeColor, getThumbnail } from "@/lib/image-compress"
import { MODULE_BY_ID } from "../modules/_registry"

// Re-export for any existing consumers
export type { NodeMode }

// ─────────────────────────────────────────────
// RefPromptEditor — contentEditable prompt with {{nodeId}} as atomic chips.
// contenteditable="false" spans are treated as a single unit by the browser:
// Backspace/Delete removes the whole chip, arrow keys skip over it.
// ─────────────────────────────────────────────

/** Poll for node id → { label, type, src } while mounted */
function useNodeDataMap() {
  const nodes = useNodes<CustomNodeData>()
  return useMemo(() => {
    const map = new Map<string, { label: string; type: string; src?: string }>()
    nodes.forEach((n) => {
      const d = n.data as CustomNodeData & { src?: string; videoPoster?: string }
      map.set(n.id, {
        label: d.label || n.id.slice(-6),
        type:  d.type  || 'text',
        src:   d.src   || d.videoPoster,
      })
    })
    return map
  }, [nodes])
}

const REF_SPLIT = /(\{\{[^}]+\}\})/g

const RefChipNode = TiptapNode.create({
  name: 'refChip',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      nodeId: { default: '' },
      label: { default: '' },
      type: { default: 'text' },
      thumb: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-ref]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const nodeId = String(HTMLAttributes.nodeId || HTMLAttributes['data-ref'] || '')
    const type = String(HTMLAttributes.type || 'text')
    const label = String(HTMLAttributes.label || nodeId.slice(-6))
    const thumb = HTMLAttributes.thumb ? String(HTMLAttributes.thumb) : null
    const color = getTypeColor(type)

    const iconContent: DOMOutputSpec = thumb
      ? ['img', { src: thumb, style: 'width:16px;height:16px;object-fit:cover;display:block;border-radius:4px;' }]
      : ['img', {
          src: getRefChipIconDataUri(type, color),
          style: 'width:10px;height:10px;display:block;'
        }]

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-ref': nodeId,
        contenteditable: 'false',
        style:
          'background-color:#ffffff;border:1px solid #e2e8f0;color:#475569;' +
          'display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 3px;border-radius:6px;' +
          'font-size:9px;font-weight:500;line-height:normal;vertical-align:middle;user-select:none;margin:0 1px;cursor:default;',
      }),
      [
        'span',
        {
          style:
            `display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;` +
            `background-color:${thumb ? 'transparent' : `${color}20`};flex-shrink:0;overflow:hidden;`,
        },
        iconContent,
      ],
      ['span', { style: 'display:block;line-height:1.3;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-bottom:1px;' }, label],
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.contentEditable = 'false'
      dom.style.display = 'inline-flex'
      dom.style.alignItems = 'center'
      dom.style.verticalAlign = 'middle'
      dom.style.whiteSpace = 'nowrap'

      const makeAnchor = () => {
        const a = document.createElement('span')
        a.setAttribute('aria-hidden', 'true')
        a.style.display = 'inline-block'
        a.style.width = '1px'
        a.style.height = '1em'
        a.style.pointerEvents = 'none'
        a.style.flexShrink = '0'
        return a
      }

      const leftAnchor = makeAnchor()
      const rightAnchor = makeAnchor()

      const chip = document.createElement('span')
      chip.contentEditable = 'false'
      chip.style.cssText =
        'background-color:#ffffff;border:1px solid #e2e8f0;color:#475569;' +
        'display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 3px;border-radius:6px;' +
        'font-size:9px;font-weight:500;line-height:normal;vertical-align:middle;user-select:none;margin:0 1px;cursor:default;'

      const iconWrap = document.createElement('span')
      iconWrap.style.cssText =
        'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;' +
        'border-radius:4px;flex-shrink:0;overflow:hidden;'

      const labelSpan = document.createElement('span')
      labelSpan.style.cssText =
        'display:block;line-height:1.3;max-width:60px;overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap;padding-bottom:1px;'

      chip.append(iconWrap, labelSpan)
      dom.append(leftAnchor, chip, rightAnchor)

      const applyAttrs = (attrs: Record<string, unknown>) => {
        const nodeId = String(attrs.nodeId || '')
        const type = String(attrs.type || 'text')
        const label = String(attrs.label || nodeId.slice(-6))
        const thumb = attrs.thumb ? String(attrs.thumb) : null
        const color = getTypeColor(type)

        chip.setAttribute('data-ref', nodeId)
        iconWrap.style.backgroundColor = thumb ? 'transparent' : `${color}20`
        labelSpan.textContent = label

        while (iconWrap.firstChild) iconWrap.removeChild(iconWrap.firstChild)
        const img = document.createElement('img')
        if (thumb) {
          img.src = thumb
          img.style.cssText = 'width:16px;height:16px;object-fit:cover;display:block;border-radius:4px;'
        } else {
          img.src = getRefChipIconDataUri(type, color)
          img.style.cssText = 'width:10px;height:10px;display:block;'
        }
        iconWrap.appendChild(img)
      }

      applyAttrs(node.attrs as Record<string, unknown>)

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'refChip') return false
          applyAttrs(updatedNode.attrs as Record<string, unknown>)
          return true
        },
      }
    }
  },
})

function valueToDoc(
  text: string,
  nodeMap: Map<string, { label: string; type: string; src?: string }>,
  thumbCache: Map<string, string>
): JSONContent {
  if (!text) return { type: 'doc', content: [{ type: 'paragraph' }] }

  const lines = text.split('\n')
  const paragraphs: JSONContent[] = lines.map((line) => {
    const content: JSONContent[] = []
    line.split(REF_SPLIT).forEach((part) => {
      const m = part.match(/^\{\{([^}]+)\}\}$/)
      if (m) {
        const nodeId = m[1].trim()
        const info = nodeMap.get(nodeId)
        const thumb = info?.src ? thumbCache.get(info.src) ?? null : null
        content.push({
          type: 'refChip',
          attrs: {
            nodeId,
            label: info?.label || nodeId.slice(-6),
            type: info?.type || 'text',
            thumb,
          },
        })
      } else if (part) {
        content.push({ type: 'text', text: part })
      }
    })

    return content.length > 0
      ? { type: 'paragraph', content }
      : { type: 'paragraph' }
  })

  return { type: 'doc', content: paragraphs }
}

function docToValue(doc: JSONContent | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return ''

  const lines = doc.content
    .filter((n) => n?.type === 'paragraph')
    .map((paragraph) => {
      const content = Array.isArray(paragraph.content) ? paragraph.content : []
      return content
        .map((node) => {
          if (node.type === 'text') return node.text || ''
          if (node.type === 'hardBreak') return '\n'
          if (node.type === 'refChip') return `{{${String(node.attrs?.nodeId || '')}}}`
          return ''
        })
        .join('')
    })

  return lines.join('\n').replace(/\n$/, '')
}

export interface RefPromptEditorHandle {
  insertReference: (nodeId: string) => void
  focus: () => void
}

export const RefPromptEditor = React.forwardRef<
  RefPromptEditorHandle,
  {
    value: string
    onChange: (v: string) => void
    readOnly?: boolean
    placeholder?: string
    minHeight?: number
    className?: string
  }
>(function RefPromptEditor({ value, onChange, readOnly, placeholder, minHeight = 100, className }, ref) {
  const editorRef = useRef<TiptapEditor | null>(null)
  const nodeMap         = useNodeDataMap()
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map())
  const loadingThumbsRef = useRef<Set<string>>(new Set())
  const lastUserInputAtRef = useRef<number>(0)
  const deferredChipSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [chipSyncRetryTick, setChipSyncRetryTick] = useState(0)

  const scheduleChipSyncRetry = useCallback(() => {
    if (deferredChipSyncTimerRef.current) clearTimeout(deferredChipSyncTimerRef.current)
    deferredChipSyncTimerRef.current = setTimeout(() => {
      setChipSyncRetryTick((v) => v + 1)
    }, 900)
  }, [])

  // Track last serialized value to break the onChange → value prop → DOM update loop
  const lastValueRef = useRef<string>('')

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
      }),
      RefChipNode,
    ],
    content: valueToDoc(value, nodeMap, thumbCache),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'w-full outline-none p-3 text-sm text-slate-600 leading-relaxed break-words [&>p]:m-0',
        style: `min-height:${minHeight}px`,
      },
      handleKeyDown(view, event) {
        const { state } = view
        const sel = state.selection
        if (!sel.empty) return false

        if (event.key === 'ArrowLeft') {
          const { $from } = sel
          const left = $from.nodeBefore
          if (left?.type?.name === 'refChip') {
            event.preventDefault()
            const posBefore = $from.pos - left.nodeSize
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, posBefore)))
            return true
          }
        }

        if (event.key === 'ArrowRight') {
          const { $from } = sel
          const right = $from.nodeAfter
          if (right?.type?.name === 'refChip') {
            event.preventDefault()
            const posAfter = $from.pos + right.nodeSize
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, posAfter)))
            return true
          }
        }

        return false
      },
      handlePaste(view, event) {
        event.preventDefault()
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (text) {
          view.dispatch(view.state.tr.insertText(text))
        }
        return true
      },
    },
    onUpdate({ editor }) {
      const serialized = docToValue(editor.getJSON())
      if (editor.isFocused && serialized !== lastValueRef.current) {
        lastUserInputAtRef.current = Date.now()
      }
      lastValueRef.current = serialized
      onChange(serialized)
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    return () => {
      if (deferredChipSyncTimerRef.current) clearTimeout(deferredChipSyncTimerRef.current)
    }
  }, [])

  // ── Imperative API ──────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    insertReference(nodeId: string) {
      const current = editorRef.current
      if (!current || readOnly) return

      const info = nodeMap.get(nodeId)
      const src = info?.src
      const thumb = src ? thumbCache.get(src) ?? null : null
      current
        .chain()
        .focus()
        .insertContent({
          type: 'refChip',
          attrs: {
            nodeId,
            label: info?.label || nodeId.slice(-6),
            type: info?.type || 'text',
            thumb,
          },
        })
        .run()
      lastUserInputAtRef.current = Date.now()

      if (src && !thumbCache.has(src) && !loadingThumbsRef.current.has(src)) {
        loadingThumbsRef.current.add(src)
        getThumbnail(src, 28)
          .then((t) => {
            if (t) {
              setThumbCache((prev) => new Map(prev).set(src, t))
            }
          })
          .catch(() => {})
          .finally(() => { loadingThumbsRef.current.delete(src) })
      }
    },
    focus() { editorRef.current?.chain().focus().run() },
  }), [nodeMap, readOnly, thumbCache])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  // ── Sync external value → DOM ───────────────────────────────────────────
  useEffect(() => {
    if (!editor) return
    if (lastValueRef.current === value) return // originated from user typing — skip
    lastValueRef.current = value
    editor.commands.setContent(valueToDoc(value, nodeMap, thumbCache), { emitUpdate: false })
  }, [editor, nodeMap, thumbCache, value])

  // ── Update chip labels/icons/thumbnails in-place when nodeMap or thumbCache refreshes ──
  useEffect(() => {
    if (!editor) return

    const tr = editor.state.tr
    let changed = false
    let hasVisualOnlyChange = false

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'refChip') return

      const nodeId = String(node.attrs.nodeId || '')
      const info = nodeMap.get(nodeId)
      if (!info) return

      const src = info.src
      const thumb = src ? thumbCache.get(src) ?? null : null

      const nextAttrs = {
        ...node.attrs,
        label: info.label || nodeId.slice(-6),
        type: info.type || 'text',
        thumb,
      }

      const labelChanged = nextAttrs.label !== node.attrs.label
      const typeChanged = nextAttrs.type !== node.attrs.type
      const thumbChanged = nextAttrs.thumb !== node.attrs.thumb

      if (labelChanged || typeChanged || thumbChanged) {
        tr.setNodeMarkup(pos, undefined, nextAttrs)
        changed = true
        if (thumbChanged || labelChanged) hasVisualOnlyChange = true
      }

      if (src && !thumbCache.has(src) && !loadingThumbsRef.current.has(src)) {
        loadingThumbsRef.current.add(src)
        getThumbnail(src, 28)
          .then((t) => {
            if (t) {
              setThumbCache((prev) => new Map(prev).set(src, t))
            }
          })
          .catch(() => {})
          .finally(() => { loadingThumbsRef.current.delete(src) })
      }
    })

    if (changed) {
      const typingGuardMs = 900
      const isTypingNow = editor.isFocused && (Date.now() - lastUserInputAtRef.current) < typingGuardMs
      if (isTypingNow && hasVisualOnlyChange) {
        scheduleChipSyncRetry()
        return
      }
      editor.view.dispatch(tr)
    }
  }, [editor, nodeMap, thumbCache, scheduleChipSyncRetry, chipSyncRetryTick])

  return (
    <div className={cn('relative', className)} style={{ minHeight }}>
      <EditorContent
        editor={editor}
        className={cn(readOnly && 'opacity-40 cursor-not-allowed pointer-events-none')}
      />
      {/* Placeholder shown when content is empty */}
      {!value && placeholder && (
        <div className="absolute top-0 left-0 right-0 p-3 text-sm text-slate-300 leading-relaxed pointer-events-none select-none">
          {placeholder}
        </div>
      )}
    </div>
  )
})

// ─────────────────────────────────────────────
// ModeToggle  — replaces SlidingTabBar
// A simple two-segment pill: Auto | Manual
// ─────────────────────────────────────────────
export function ModeToggle({
  mode,
  onChange,
}: {
  mode: NodeMode
  onChange: (m: NodeMode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const btn = containerRef.current.querySelector(
      `[data-mode="${mode}"]`,
    ) as HTMLElement | null
    if (btn) setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth, ready: true })
  }, [mode])

  const OPTIONS: { id: NodeMode; icon: React.ComponentType<any>; label: string }[] = [
    { id: "auto",   icon: Bot,        label: "Auto"   },
    { id: "manual", icon: Hand,       label: "Manual" },
    { id: "done",   icon: StickyNote, label: "Note"   },
  ]

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={containerRef}
        className="relative flex items-center bg-white/50 backdrop-blur-md rounded-full p-1 shadow-md border border-slate-200/50 gap-0.5 select-none"
      >
        {/* Sliding indicator */}
        <div
          className={cn(
            "absolute top-1 bottom-1 rounded-full bg-slate-100 shadow-sm border border-slate-200/60",
            indicator.ready
              ? "transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              : "",
          )}
          style={{ left: indicator.left, width: indicator.width }}
        />

        {OPTIONS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            data-mode={id}
            onClick={() => onChange(id)}
            className={cn(
              "relative z-10 flex items-center gap-1.5 px-4 py-1.5 rounded-full",
              "text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap",
              mode === id ? "text-slate-800" : "text-slate-400 hover:text-slate-600",
            )}
          >
            <Icon size={12} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* Sub-label */}
      <p className="text-[10px] text-slate-400 text-center leading-relaxed">
        {mode === "auto"
          ? "Prompt is locked — node runs automatically in the workflow"
          : mode === "done"
            ? "Note mode — no generation, just a label for this node"
            : "Edit the prompt and trigger generation manually"}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────
interface ParamDef { id: string; label: string; options: string[] }

/** Generic helpers — derive ParamDef[] and defaults from a ModelDef array */
// Given an aspect_ratio string like "16:9", return node width/height
// keeping the long side at `base` pixels.
function nodeSizeFromRatio(ratio: string, base = 240): { width: number; height: number } {
  if (!ratio || ratio === 'auto') return { width: base, height: base }
  const [rw, rh] = ratio.split(':').map(Number)
  if (!rw || !rh) return { width: base, height: base }
  return rw >= rh
    ? { width: base, height: Math.round(base * rh / rw) }
    : { width: Math.round(base * rw / rh), height: base }
}

function paramsForModel(allModels: ModelDef[], modelId: string): ParamDef[] {
  const def = allModels.find(m => m.id === modelId)
  return (def?.params ?? []).map(p => ({ id: p.key, label: p.label, options: p.options }))
}
function defaultParamsForModel(allModels: ModelDef[], modelId: string): Record<string, string> {
  const def = allModels.find(m => m.id === modelId)
  return Object.fromEntries((def?.params ?? []).map(p => [p.key, p.default]))
}

/** Single popover button with segmented controls — replaces multiple ParamDropdowns */
function ModelParamsPopover({
  params,
  selected,
  onChange,
  locked,
}: {
  params: ParamDef[]
  selected: Record<string, string>
  onChange: (id: string, val: string) => void
  locked?: boolean
}) {
  if (params.length === 0) return null
  const summary = params.map(p => selected[p.id] ?? p.options[0]).join(" · ")
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          disabled={locked}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs text-slate-600 font-medium transition-all border border-transparent",
            locked ? "opacity-30 cursor-not-allowed" : "hover:bg-slate-100/80 hover:border-slate-200/80",
          )}
        >
          <SlidersHorizontal size={10} className="text-slate-400" />
          <span>{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-60 p-3">
        <div className="space-y-3">
          {params.map(param => (
            <div key={param.id}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {param.label}
              </p>
              <div className={cn(
                "bg-slate-100 rounded-lg p-0.5 gap-0.5",
                param.options.length <= 4 ? "flex" : "grid grid-cols-4"
              )}>
                {param.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => onChange(param.id, opt)}
                    className={cn(
                      "py-1 text-xs font-medium rounded-md transition-all",
                      param.options.length <= 4 ? "flex-1" : "",
                      selected[param.id] === opt
                        ? "bg-white shadow-sm text-slate-800"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ModelDropdown({
  models,
  value,
  onChange,
  locked,
}: {
  models: { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
  locked?: boolean
}) {
  const name = models.find((m) => m.id === value)?.name ?? value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={locked}>
        <button
          disabled={locked}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full text-xs text-slate-600 font-medium transition-all border border-transparent",
            locked
              ? "opacity-30 cursor-not-allowed"
              : "hover:bg-slate-100/80 hover:border-slate-200/80",
          )}
        >
          {name}
          <ChevronUp size={10} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
          Model
        </div>
        {models.map((m) => (
          <DropdownMenuItem
            key={m.id}
            className={cn("text-xs", value === m.id && "font-semibold text-slate-800")}
            onClick={() => onChange(m.id)}
          >
            {m.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─────────────────────────────────────────────
// GenerateTextPanel
// ─────────────────────────────────────────────
export function GenerateTextPanel({
  data,
  nodeId,
  refHandleId,
  onDataChange,
  mode,
  isGenerating,
  onGenerate,
  onStop,
  placeholder,
}: {
  data: CustomNodeData
  nodeId?: string
  /** If set, only show upstream nodes connected via this specific handle */
  refHandleId?: string
  /** Direct callback — preferred over data.onDataChange to avoid async injection timing. */
  onDataChange?: (u: Partial<CustomNodeData>) => void
  mode: NodeMode
  isGenerating: boolean
  onGenerate: (prompt: string, model: string, params: Record<string, string>) => void
  onStop: () => void
  placeholder?: { auto: string; manual: string }
}) {
  // Local state for responsive UI — initialized once from data (key-remount handles node switching)
  const [prompt, setPromptLocal] = useState(data.prompt ?? "")
  const [model,  setModelLocal]  = useState(data.model  ?? TEXT_MODELS[0].id)
  const [params, setParamsLocal] = useState<Record<string, string>>(data.params ?? defaultParamsForModel(TEXT_MODELS, data.model ?? TEXT_MODELS[0].id))
  const editorRef = useRef<RefPromptEditorHandle>(null)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => { setPromptLocal(v); persistChange?.({ prompt: v }) }
  const setModel  = (v: string) => {
    setModelLocal(v)
    const newDefaults = defaultParamsForModel(TEXT_MODELS, v)
    setParamsLocal(newDefaults)
    persistChange?.({ model: v, params: newDefaults })
  }
  const handleParamChange = (id: string, val: string) => {
    const p = { ...params, [id]: val }
    setParamsLocal(p)
    persistChange?.({ params: p })
  }

  const isAuto      = mode === "auto"
  const isNote      = mode === "done"
  const canSubmit   = prompt.trim().length > 0
  const buttonLabel = "Generate"

  // Detect upstream image nodes to warn if model doesn't support image input
  const { getNodes, getEdges } = useReactFlow()
  const hasUpstreamImage = nodeId ? (() => {
    const edges = getEdges().filter(e => e.target === nodeId)
    const nodes = getNodes()
    return edges.some(e => {
      const src = nodes.find(n => n.id === e.source)
      return src?.data?.type === "image"
    })
  })() : false
  const textModelDef = TEXT_MODELS.find(m => m.id === model)
  const showImageInputWarning = hasUpstreamImage && !textModelDef?.supportsImageInput

  // Insert chip at current cursor position inside the editor
  const handleInsertReference = useCallback((ref: string) => {
    const nodeId = ref.replace(/^\{\{/, '').replace(/\}\}$/, '')
    editorRef.current?.insertReference(nodeId)
  }, [])

  return (
    <div className="flex flex-col">
      {/* Upstream reference area */}
      {nodeId && (
        <UpstreamReference
          nodeId={nodeId}
          handleId={refHandleId}
          onInsertReference={handleInsertReference}
        />
      )}
      <RefPromptEditor
        ref={editorRef}
        value={prompt}
        onChange={(v) => !isGenerating && setPrompt(v)}
        placeholder={
          isNote
            ? "Write a note about this node…"
            : placeholder
              ? (isAuto ? placeholder.auto : placeholder.manual)
              : isAuto
                ? "Set a fixed prompt — the node will run this automatically…"
                : "Describe the text content you want to generate…"
        }
        readOnly={isGenerating}
        minHeight={100}
      />
      {showImageInputWarning && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border-t border-amber-100 text-amber-700 text-[11px]">
          <AlertTriangle size={11} className="flex-shrink-0" />
          <span>{textModelDef?.name ?? model} doesn't support image input. Switch to Gemini, Claude, or GPT to use image references.</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown models={TEXT_MODELS} value={model} onChange={setModel} locked={isNote || isGenerating} />
        <ModelParamsPopover params={paramsForModel(TEXT_MODELS, model)} selected={params} onChange={handleParamChange} locked={isNote || isGenerating} />
        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-300/80 active:scale-95 transition-all duration-150"
          >
            <Square size={10} className="fill-rose-600" />
            Stop
          </button>
        ) : isAuto || isNote ? (
          <>
            <span className="ml-auto text-xs font-medium text-slate-500 select-none">
              {creditLabel(model, params)}
            </span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-slate-300 border border-slate-100 select-none">
              <Lock size={10} />
              {isNote ? "Note mode" : "Runs in workflow"}
            </div>
          </>
        ) : (
          <>
            <span className="ml-auto text-xs font-medium text-slate-500 select-none">
              {creditLabel(model, params)}
            </span>
            <button
              disabled={!canSubmit}
              onClick={() => onGenerate(prompt, model, params)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150",
                canSubmit
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95"
                  : "text-slate-300 cursor-not-allowed border border-slate-200/60",
              )}
            >
              <Zap size={11} />
              {buttonLabel}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// GenerateImagePanel
// ─────────────────────────────────────────────
export function GenerateImagePanel({
  data,
  nodeId,
  onDataChange,
  hasSrc,
  mode,
  isGenerating,
  onGenerate,
  onStop,
}: {
  data: CustomNodeData
  nodeId?: string
  /** Direct callback — preferred over data.onDataChange to avoid async injection timing. */
  onDataChange?: (u: Partial<CustomNodeData>) => void
  hasSrc: boolean
  mode: NodeMode
  isGenerating: boolean
  onGenerate: (prompt: string, model: string, params: Record<string, string>) => void
  onStop: () => void
}) {
  // Local state for responsive UI — initialized once from data (key-remount handles node switching)
  const [prompt, setPromptLocal] = useState(data.prompt ?? "")
  const [model,  setModelLocal]  = useState(data.model  ?? IMAGE_MODELS[0].id)
  const [params, setParamsLocal] = useState<Record<string, string>>(data.params ?? defaultParamsForModel(IMAGE_MODELS, data.model ?? IMAGE_MODELS[0].id))
  const editorRef = useRef<RefPromptEditorHandle>(null)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => { setPromptLocal(v); persistChange?.({ prompt: v }) }
  const setModel  = (v: string) => {
    setModelLocal(v)
    const newDefaults = defaultParamsForModel(IMAGE_MODELS, v)
    setParamsLocal(newDefaults)
    persistChange?.({ model: v, params: newDefaults })
  }
  const handleParamChange = (id: string, val: string) => {
    const p = { ...params, [id]: val }
    setParamsLocal(p)
    const update: Partial<CustomNodeData> = { params: p }
    if (id === 'aspect_ratio' && !hasSrc) {
      const { width, height } = nodeSizeFromRatio(val)
      update.width  = width
      update.height = height
    }
    persistChange?.(update)
  }

  const isAuto      = mode === "auto"
  const isNote      = mode === "done"
  const canSubmit   = prompt.trim().length > 0
  const ActionIcon  = hasSrc ? RefreshCw : Zap
  const buttonLabel = hasSrc ? "Regenerate" : "Generate"

  // Detect upstream image nodes to warn if model doesn't support image input
  const { getNodes, getEdges } = useReactFlow()
  const hasUpstreamImage = nodeId ? (() => {
    const edges = getEdges().filter(e => e.target === nodeId)
    const nodes = getNodes()
    return edges.some(e => {
      const src = nodes.find(n => n.id === e.source)
      return src?.data?.type === "image"
    })
  })() : false
  const modelDef = IMAGE_MODELS.find(m => m.id === model)
  const showImageInputWarning = hasUpstreamImage && modelDef?.supportsImageInput === false

  // Insert chip at current cursor position inside the editor
  const handleInsertReference = useCallback((ref: string) => {
    const nodeId = ref.replace(/^\{\{/, '').replace(/\}\}$/, '')
    editorRef.current?.insertReference(nodeId)
  }, [])

  return (
    <div className="flex flex-col">
      {/* Upstream reference area */}
      {nodeId && (
        <UpstreamReference
          nodeId={nodeId}
          onInsertReference={handleInsertReference}
        />
      )}
      <RefPromptEditor
        ref={editorRef}
        value={prompt}
        onChange={(v) => !isGenerating && setPrompt(v)}
        placeholder={
          isNote
            ? "Write a note about this node…"
            : isAuto
              ? "Set a fixed prompt — the node will run this automatically…"
              : hasSrc
                ? "Describe how to edit this image…"
                : "Describe the image you want to generate…"
        }
        readOnly={isGenerating}
        minHeight={100}
      />
      {showImageInputWarning && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border-t border-amber-100 text-amber-700 text-[11px]">
          <AlertTriangle size={11} className="flex-shrink-0" />
          <span>nano-banana doesn't support image input. Try <button className="underline font-medium" onClick={() => setModel("nano-banana-pro")}>nano-banana-pro</button>.</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown models={IMAGE_MODELS} value={model} onChange={setModel} locked={isNote || isGenerating} />
        <ModelParamsPopover params={paramsForModel(IMAGE_MODELS, model)} selected={params} onChange={handleParamChange} locked={isNote || isGenerating} />
        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-300/80 active:scale-95 transition-all duration-150"
          >
            <Square size={10} className="fill-rose-600" />
            Stop
          </button>
        ) : isAuto || isNote ? (
          <>
            <span className="ml-auto text-xs font-medium text-slate-500 select-none">
              {creditLabel(model, params)}
            </span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-slate-300 border border-slate-100 select-none">
              <Lock size={10} />
              {isNote ? "Note mode" : "Runs in workflow"}
            </div>
          </>
        ) : (
          <>
            <span className="ml-auto text-xs font-medium text-slate-500 select-none">
              {creditLabel(model, params)}
            </span>
            <button
              disabled={!canSubmit}
              onClick={() => onGenerate(prompt, model, params)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150",
                canSubmit
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95"
                  : "text-slate-300 cursor-not-allowed border border-slate-200/60",
              )}
            >
              <ActionIcon size={11} />
              {buttonLabel}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// GenerateVideoPanel
// ─────────────────────────────────────────────
// Video panel uses the generic helpers above

export function GenerateVideoPanel({
  data,
  nodeId,
  onDataChange,
  hasSrc,
  mode,
  isGenerating,
  onGenerate,
  onStop,
}: {
  data: CustomNodeData
  nodeId?: string
  /** Direct callback — preferred over data.onDataChange to avoid async injection timing. */
  onDataChange?: (u: Partial<CustomNodeData>) => void
  hasSrc: boolean
  mode: NodeMode
  isGenerating: boolean
  onGenerate: (prompt: string, model: string, params: Record<string, string>) => void
  onStop: () => void
}) {
  // Local state for responsive UI — initialized once from data (key-remount handles node switching)
  const [prompt, setPromptLocal] = useState(data.prompt ?? "")
  const [model,  setModelLocal]  = useState(data.model  ?? VIDEO_MODELS[0].id)
  const [params, setParamsLocal] = useState<Record<string, string>>(data.params ?? defaultParamsForModel(VIDEO_MODELS, data.model ?? VIDEO_MODELS[0].id))
  const editorRef = useRef<RefPromptEditorHandle>(null)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => {
    setPromptLocal(v)
    persistChange?.({ prompt: v })
  }
  const setModel = (v: string) => {
    setModelLocal(v)
    const newDefaults = defaultParamsForModel(VIDEO_MODELS, v)
    setParamsLocal(newDefaults)
    persistChange?.({ model: v, params: newDefaults })
  }
  const setParams = (p: Record<string, string>) => {
    setParamsLocal(p)
    persistChange?.({ params: p })
  }

  const handleParamChange = (id: string, val: string) => {
    const newParams = { ...params, [id]: val }
    setParamsLocal(newParams)
    const update: Partial<CustomNodeData> = { params: newParams }
    if (id === 'aspect_ratio' && !hasSrc) {
      const { width, height } = nodeSizeFromRatio(val)
      update.width  = width
      update.height = height
    }
    persistChange?.(update)
  }

  const isAuto      = mode === "auto"
  const isNote      = mode === "done"
  const canSubmit   = prompt.trim().length > 0
  const buttonLabel = hasSrc ? "Regenerate" : "Generate"

  // Insert chip at current cursor position inside the editor
  const handleInsertReference = useCallback((ref: string) => {
    const nodeId = ref.replace(/^\{\{/, '').replace(/\}\}$/, '')
    editorRef.current?.insertReference(nodeId)
  }, [])

  return (
    <div className="flex flex-col">
      {/* Upstream reference area */}
      {nodeId && (
        <UpstreamReference
          nodeId={nodeId}
          onInsertReference={handleInsertReference}
        />
      )}
      <RefPromptEditor
        ref={editorRef}
        value={prompt}
        onChange={(v) => !isGenerating && setPrompt(v)}
        placeholder={
          isNote
            ? "Write a note about this node…"
            : isAuto
              ? "Set a fixed prompt — the node will run this automatically…"
              : hasSrc
                ? "Describe the motion or scene transformation…"
                : "Describe the video you want to generate…"
        }
        readOnly={isGenerating}
        minHeight={100}
      />
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown models={VIDEO_MODELS} value={model} onChange={setModel} locked={isNote || isGenerating} />
        <ModelParamsPopover params={paramsForModel(VIDEO_MODELS, model)} selected={params} onChange={handleParamChange} locked={isNote || isGenerating} />
        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-300/80 active:scale-95 transition-all duration-150"
          >
            <Square size={10} className="fill-rose-600" />
            Stop
          </button>
        ) : isAuto || isNote ? (
          <>
            <span className="ml-auto text-xs font-medium text-slate-500 select-none">
              {creditLabel(model, params)}
            </span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-slate-300 border border-slate-100 select-none">
              <Lock size={10} />
              {isNote ? "Note mode" : "Runs in workflow"}
            </div>
          </>
        ) : (
          <>
            <span className="ml-auto text-xs font-medium text-slate-500 select-none">
              {creditLabel(model, params)}
            </span>
            <button
              disabled={!canSubmit}
              onClick={() => onGenerate(prompt, model, params)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150",
                canSubmit
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95"
                  : "text-slate-300 cursor-not-allowed border border-slate-200/60",
              )}
            >
              <Zap size={11} />
              {buttonLabel}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// InstancesBox — sits to the right of the template prompt textarea
// Simplified: only max limit, no auto/fixed mode toggle (AI nodes always use max cap)
// ─────────────────────────────────────────────
export function InstancesBox({
  count,
  onChange,
  locked,
  theme = "indigo",
  label = "Instances",
}: {
  count: number
  onChange: (count: number) => void
  locked?: boolean
  theme?: "indigo" | "violet"
  label?: string
}) {
  const themeClasses = {
    indigo: {
      header: "text-indigo-400",
      number: "text-indigo-500",
      unit: "text-indigo-300",
      track: "bg-indigo-100",
      range: "bg-indigo-400",
      thumb: "border-indigo-400 focus-visible:ring-indigo-400",
      scale: "text-indigo-200",
    },
    violet: {
      header: "text-violet-400",
      number: "text-violet-500",
      unit: "text-violet-300",
      track: "bg-violet-100",
      range: "bg-violet-400",
      thumb: "border-violet-400 focus-visible:ring-violet-400",
      scale: "text-violet-200",
    },
  }
  const t = themeClasses[theme]

  return (
    <div className="flex flex-col gap-3 w-[148px] flex-shrink-0 px-3 py-3 border-l border-slate-100">
      {/* Header */}
      <span className={cn("text-[10px] font-semibold tracking-widest uppercase select-none", t.header)}>
        {label}
      </span>

      {/* Big number display — Apple clock style */}
      <div className="flex items-baseline justify-center gap-1">
        <span
          className={cn(
            "font-semibold tabular-nums leading-none transition-all duration-150",
            count >= 10 ? "text-3xl" : "text-4xl",
            t.number,
          )}
        >
          {count}
        </span>
        <span className={cn("text-[11px] font-medium", t.unit)}>
          {count === 1 ? "max" : "max"}
        </span>
      </div>

      {/* Radix slider */}
      <SliderPrimitive.Root
        min={1}
        max={20}
        step={1}
        value={[count]}
        disabled={locked}
        onValueChange={([v]) => onChange(v)}
        className={cn(
          "relative flex items-center select-none touch-none w-full h-5",
          locked && "opacity-40 pointer-events-none",
        )}
      >
        <SliderPrimitive.Track className={cn("relative rounded-full flex-1 h-1.5 overflow-hidden", t.track)}>
          <SliderPrimitive.Range className={cn("absolute h-full rounded-full", t.range)} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cn(
            "block w-4 h-4 rounded-full bg-white shadow-md border-2",
            "outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            "transition-transform duration-100 hover:scale-110 active:scale-125",
            "cursor-grab active:cursor-grabbing",
            t.thumb,
          )}
        />
      </SliderPrimitive.Root>

      {/* Min / Max labels */}
      <div className={cn("flex justify-between text-[10px] font-medium tabular-nums px-0.5 -mt-1", t.scale)}>
        <span>1</span>
        <span>20</span>
      </div>

      {/* Contextual hint */}
      <p className="text-[10px] text-slate-300 leading-relaxed">
        Maximum iterations — LLM decides actual count up to this cap.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// TemplatePanel — prompt + InstancesBox side-by-side
// Template is essentially a text node with system prompt and JSON output
// ─────────────────────────────────────────────
const TEMPLATE_PARAMS: ParamDef[] = [
  { id: "variation", label: "Variation", options: ["Low", "Medium", "High"] },
  { id: "strategy",  label: "Strategy",  options: ["Sequential", "Parallel", "Random"] },
]

export function TemplatePanel({
  data,
  nodeId,
  onDataChange,
  mode,
  isGenerating,
  onGenerate,
  onStop,
}: {
  data: CustomNodeData
  nodeId?: string
  /** Direct callback — preferred over data.onDataChange to avoid async injection timing. */
  onDataChange?: (u: Partial<CustomNodeData>) => void
  mode: NodeMode
  isGenerating: boolean
  onGenerate: (prompt: string, model: string, params: Record<string, string>) => void
  onStop: () => void
}) {
  // Local state for responsive UI — initialized once from data (key-remount handles node switching)
  const [prompt, setPromptLocal]             = useState(data.templatePrompt ?? data.prompt ?? "")
  const [model,  setModelLocal]              = useState(data.model  ?? TEXT_MODELS[0].id)
  const [params, setParamsLocal]             = useState<Record<string, string>>(data.params ?? defaultParamsForModel(TEXT_MODELS, data.model ?? TEXT_MODELS[0].id))
  // maxInstances is the user-facing cap (templateCount). It is completely separate from
  // instanceCount (the actual number of cloned instances managed by useTemplateManager).
  const [maxInstances, setMaxInstancesLocal] = useState(data.templateCount ?? data.templateCountLegacy ?? 3)
  const editorRef = useRef<RefPromptEditorHandle>(null)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => { setPromptLocal(v); persistChange?.({ templatePrompt: v, prompt: v }) }
  const setModel  = (v: string) => {
    setModelLocal(v)
    const newDefaults = defaultParamsForModel(TEXT_MODELS, v)
    setParamsLocal(newDefaults)
    persistChange?.({ model: v, params: newDefaults })
  }
  const handleParamChange = (id: string, val: string) => {
    const p = { ...params, [id]: val }
    setParamsLocal(p)
    persistChange?.({ params: p })
  }
  // Only write templateCount — never instanceCount (which tracks real cloned instances).
  const setMaxInstances = (n: number) => {
    setMaxInstancesLocal(n)
    persistChange?.({ templateCount: n })
  }

  // Insert chip at current cursor position inside the editor
  const handleInsertReference = useCallback((ref: string) => {
    const nodeId = ref.replace(/^\{\{/, '').replace(/\}\}$/, '')
    editorRef.current?.insertReference(nodeId)
  }, [])

  const isAuto      = mode === "auto"
  const isNote      = mode === "done"
  const canSubmit   = prompt.trim().length > 0
  const buttonLabel = "Run Template"

  // Template's own cost is 1 credit (text generation returning JSON).
  // Instance execution costs are additional, tracked by the workflow budget.
  const templateCost = 1

  const handleGenerate = () => {
    onGenerate(prompt, model, {
      ...params,
      instanceMax: String(maxInstances),
    })
  }

  return (
    <div className="flex flex-col">
      {/* Upstream reference area */}
      {nodeId && (
        <UpstreamReference
          nodeId={nodeId}
          onInsertReference={handleInsertReference}
        />
      )}
      {/* Top area: prompt left, instances right */}
      <div className="flex min-h-[110px]">
        <RefPromptEditor
          ref={editorRef}
          value={prompt}
          onChange={(v) => !isGenerating && setPrompt(v)}
          placeholder={
            isNote
              ? "Write a note about this template…"
              : isAuto
                ? "Set a fixed template prompt — the node will run this automatically…"
                : "Describe the template behavior, e.g. 'Generate 5 variations with increasing formality'…"
          }
          readOnly={isGenerating}
          minHeight={110}
          className="flex-1"
        />

        <InstancesBox
          count={maxInstances}
          onChange={setMaxInstances}
          locked={isGenerating}
          theme="indigo"
          label="Instances"
        />
      </div>

      {/* Footer bar — model + params + instance chip + credits + run button */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown models={TEXT_MODELS} value={model} onChange={setModel} locked={isNote || isGenerating} />
        <ModelParamsPopover params={paramsForModel(TEXT_MODELS, model)} selected={params} onChange={handleParamChange} locked={isNote || isGenerating} />

        {/* Instance summary chip */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 border border-indigo-100/80">
          <Infinity size={10} className="text-indigo-400" strokeWidth={2.5} />
          <span className="text-[11px] text-indigo-500 font-medium">
            ≤ {maxInstances} runs
          </span>
        </div>

        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-300/80 active:scale-95 transition-all duration-150"
          >
            <Square size={10} className="fill-rose-600" />
            Stop
          </button>
        ) : isAuto || isNote ? (
          <>
            <span className="ml-auto text-xs font-medium text-slate-500 select-none">
              {templateCost} credit
            </span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-slate-300 border border-slate-100 select-none">
              <Lock size={10} />
              {isNote ? "Note mode" : "Runs in workflow"}
            </div>
          </>
        ) : (
          <>
            <span className="ml-auto text-xs font-medium text-slate-500 select-none">
              {templateCost} credit + instances
            </span>
            <button
              disabled={!canSubmit}
              onClick={() => handleGenerate()}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150",
                canSubmit
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95"
                  : "text-slate-300 cursor-not-allowed border border-slate-200/60",
              )}
            >
              <Zap size={11} />
              {buttonLabel}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PanelContent — routes data.type → panel
// ─────────────────────────────────────────────
// PanelContent and getPanelTitle have been removed.
// Each module now exports its own ModalContent.
// NodeEditor shell calls MODULE_BY_ID[type].ModalContent directly.
