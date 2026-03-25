"use client"

import React, { useState, useRef, useLayoutEffect, useCallback, useEffect, useImperativeHandle } from "react"
import { useReactFlow } from "reactflow"
import { Sparkles, Zap, RefreshCw, Square, Bot, Hand, ChevronUp, Infinity, Hash } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import * as SliderPrimitive from "@radix-ui/react-slider"
import type { CustomNodeData, NodeMode } from "../modules/_types"
import { UpstreamReference } from "./_upstream_reference"
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
  const { getNodes } = useReactFlow()
  const [nodeMap, setNodeMap] = useState<Map<string, { label: string; type: string; src?: string }>>(new Map())
  useEffect(() => {
    const compute = () => {
      const map = new Map<string, { label: string; type: string; src?: string }>()
      getNodes().forEach((n) => {
        const d = n.data as CustomNodeData & { src?: string; videoPoster?: string }
        map.set(n.id, {
          label: d.label || n.id.slice(-6),
          type:  d.type  || 'text',
          src:   d.src   || d.videoPoster,
        })
      })
      setNodeMap(map)
    }
    compute()
    const timer = setInterval(compute, 1000)
    return () => clearInterval(timer)
  }, [getNodes])
  return nodeMap
}

const REF_SPLIT = /(\{\{[^}]+\}\})/g

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Returns the inner SVG elements for a given node type (matches Lucide icons used in modules). */
function getTypeIconSvgInner(type: string): string {
  switch (type) {
    case 'text':
      return '<line x1="21" x2="3" y1="6" y2="6" stroke-linecap="round"/><line x1="15" x2="3" y1="12" y2="12" stroke-linecap="round"/><line x1="17" x2="3" y1="18" y2="18" stroke-linecap="round"/>'
    case 'image':
      return '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
    case 'video':
      return '<path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>'
    case 'filter':
      return '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>'
    case 'seed':
      return '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>'
    case 'template':
      return '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m6.08 9.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59"/>'
    default:
      return '<line x1="21" x2="3" y1="6" y2="6" stroke-linecap="round"/><line x1="15" x2="3" y1="12" y2="12" stroke-linecap="round"/>'
  }
}

function buildChipHtml(nodeId: string, info: { label: string; type: string } | undefined): string {
  const label = info?.label || nodeId.slice(-6)
  const type  = info?.type  || 'text'
  const color = getTypeColor(type)
  // Icon box: 16×16 with Lucide SVG icon — matches upstream-reference REF chip style
  const iconBox =
    `<span data-chip-icon style="display:inline-flex;align-items:center;justify-content:center;` +
    `width:16px;height:16px;border-radius:4px;background-color:${color}20;flex-shrink:0;">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    getTypeIconSvgInner(type) +
    `</svg></span>`
  return (
    `<span contenteditable="false" data-ref="${escapeHtml(nodeId)}" ` +
    `style="background-color:#ffffff;border:1px solid #e2e8f0;color:#475569;` +
    `display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 4px;border-radius:6px;` +
    `font-size:9px;font-weight:500;line-height:inherit;vertical-align:middle;user-select:none;">` +
    iconBox +
    `<span data-chip-label style="max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(label)}</span>` +
    `</span>`
  )
}

function valueToHtml(text: string, nodeMap: Map<string, { label: string; type: string }>): string {
  if (!text) return ''
  return text
    .split(REF_SPLIT)
    .map((part) => {
      const m = part.match(/^\{\{([^}]+)\}\}$/)
      if (m) return buildChipHtml(m[1].trim(), nodeMap.get(m[1].trim()))
      return escapeHtml(part).replace(/\n/g, '<br>')
    })
    .join('')
}

function serializeContent(div: HTMLDivElement): string {
  let text = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
    } else if (node instanceof HTMLElement) {
      if (node.dataset.ref) { text += `{{${node.dataset.ref}}}`; return }
      if (node.tagName === 'BR') { text += '\n'; return }
      node.childNodes.forEach(walk)
      if ((node.tagName === 'DIV' || node.tagName === 'P') && node !== div) text += '\n'
    }
  }
  div.childNodes.forEach(walk)
  return text.replace(/\n$/, '') // strip trailing newline contentEditable appends
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
  const editorRef       = useRef<HTMLDivElement>(null)
  const nodeMap         = useNodeDataMap()
  const nodeMapRef      = useRef(nodeMap)
  nodeMapRef.current    = nodeMap
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map())
  const loadingThumbsRef = useRef<Set<string>>(new Set())

  // Track last serialized value to break the onChange → value prop → DOM update loop
  const lastValueRef = useRef<string>('')

  // ── Imperative API ──────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    insertReference(nodeId: string) {
      const div = editorRef.current
      if (!div || readOnly) return

      // Build chip element
      const tmp = document.createElement('span')
      tmp.innerHTML = buildChipHtml(nodeId, nodeMapRef.current.get(nodeId))
      const chip = tmp.firstChild as ChildNode

      // Insert at current cursor if already inside the editor, else append to end
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && div.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0)
        range.deleteContents()
        range.insertNode(chip)
      } else {
        div.appendChild(chip)
      }

      // Serialize and report change immediately (before focus/cursor settle)
      const serialized = serializeContent(div)
      lastValueRef.current = serialized
      onChange(serialized)

      // Focus + place cursor after chip.
      // Use requestAnimationFrame so the browser has processed the DOM mutation
      // and focus events before we set the Selection — fixes the empty-div case
      // where addRange fails if called synchronously during a focus transition.
      div.focus()
      requestAnimationFrame(() => {
        try {
          const sel2 = window.getSelection()
          const after = document.createRange()
          after.setStartAfter(chip)
          after.collapse(true)
          sel2?.removeAllRanges()
          sel2?.addRange(after)
        } catch {
          // Silently ignore if chip was removed in the meantime
        }
      })
    },
    focus() { editorRef.current?.focus() },
  }), [onChange, readOnly])

  // ── Sync external value → DOM ───────────────────────────────────────────
  useEffect(() => {
    const div = editorRef.current
    if (!div) return
    if (lastValueRef.current === value) return // originated from user typing — skip
    lastValueRef.current = value
    div.innerHTML = valueToHtml(value, nodeMapRef.current)
    if (document.activeElement === div) {
      // Keep cursor at end when focused (e.g. after programmatic insert)
      const r = document.createRange()
      r.selectNodeContents(div)
      r.collapse(false)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(r)
    }
  }, [value])

  // ── Update chip labels/icons/thumbnails in-place when nodeMap or thumbCache refreshes ──
  useEffect(() => {
    const div = editorRef.current
    if (!div) return
    div.querySelectorAll<HTMLElement>('[data-ref]').forEach((chip) => {
      const nodeId = chip.dataset.ref!
      const info   = nodeMap.get(nodeId)

      if (!info) {
        // Node was deleted — grey out and strikethrough
        chip.style.opacity         = '0.4'
        chip.style.textDecoration  = 'line-through'
        return
      }

      chip.style.opacity        = ''
      chip.style.textDecoration = ''

      const label = info.label || nodeId.slice(-6)
      const color = getTypeColor(info.type)

      const labelEl = chip.querySelector('[data-chip-label]')
      if (labelEl && labelEl.textContent !== label) labelEl.textContent = label

      const iconEl = chip.querySelector<HTMLElement>('[data-chip-icon]')
      if (!iconEl) return

      const thumb = info.src ? thumbCache.get(info.src) : undefined

      if (thumb) {
        // Show compressed thumbnail — identical to REF chip img style
        iconEl.style.backgroundColor = 'transparent'
        iconEl.style.borderRadius    = '4px'
        iconEl.style.overflow        = 'hidden'
        iconEl.innerHTML = `<img src="${thumb}" style="width:16px;height:16px;object-fit:cover;display:block;border-radius:4px;" />`
      } else {
        // Show SVG icon with type color
        iconEl.style.backgroundColor = `${color}20`
        iconEl.innerHTML =
          `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" ` +
          `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
          getTypeIconSvgInner(info.type) +
          `</svg>`
      }

      // Kick off async thumbnail load if not yet cached
      if (info.src && !thumbCache.has(info.src) && !loadingThumbsRef.current.has(info.src)) {
        loadingThumbsRef.current.add(info.src)
        getThumbnail(info.src, 28)
          .then((t) => { if (t) setThumbCache((prev) => new Map(prev).set(info.src!, t)) })
          .catch(() => {})
          .finally(() => { loadingThumbsRef.current.delete(info.src!) })
      }
    })
  }, [nodeMap, thumbCache])

  // ── User input handler ──────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    const div = editorRef.current
    if (!div) return
    const serialized = serializeContent(div)
    lastValueRef.current = serialized
    onChange(serialized)
  }, [onChange])

  // ── Paste: strip HTML, insert plain text ────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    handleInput()
  }, [handleInput])

  return (
    <div className={cn('relative', className)} style={{ minHeight }}>
      <div
        ref={editorRef}
        contentEditable={readOnly ? false : true}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        className={cn(
          'w-full outline-none p-3 text-sm text-slate-700 leading-relaxed break-words',
          readOnly && 'opacity-40 cursor-not-allowed pointer-events-none',
        )}
        style={{ minHeight }}
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
    { id: "auto",   icon: Bot,  label: "Auto"   },
    { id: "manual", icon: Hand, label: "Manual" },
  ]

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={containerRef}
        className="relative flex items-center bg-white/90 backdrop-blur-md rounded-full p-1 shadow-md border border-slate-200/80 gap-0.5 select-none"
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
          : "Edit the prompt and trigger generation manually"}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────
interface ParamDef { id: string; label: string; options: string[] }

function ParamDropdowns({
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
  return (
    <>
      {params.map((param) => (
        <DropdownMenu key={param.id}>
          <DropdownMenuTrigger asChild disabled={locked}>
            <button
              disabled={locked}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs text-slate-700 font-medium transition-all border border-transparent",
                locked
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-slate-100/80 hover:border-slate-200/80",
              )}
            >
              {selected[param.id]}
              <ChevronUp size={10} className="text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
              {param.label}
            </div>
            {param.options.map((opt) => (
              <DropdownMenuItem
                key={opt}
                className={cn("text-xs", selected[param.id] === opt && "font-semibold text-slate-800")}
                onClick={() => onChange(param.id, opt)}
              >
                {opt}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </>
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
const TEXT_MODELS = [
  { id: "gemini-2.0-flash",  name: "Gemini 2.0 Flash"  },
  { id: "gemini-1.5-pro",    name: "Gemini 1.5 Pro"    },
  { id: "gpt-4o",            name: "GPT-4o"             },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet"  },
]

const TEXT_PARAMS: ParamDef[] = [
  { id: "tone",   label: "Tone",   options: ["Neutral", "Formal", "Casual", "Creative"] },
  { id: "length", label: "Length", options: ["Short", "Medium", "Long"]                 },
]

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
  const editorRef = useRef<RefPromptEditorHandle>(null)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => {
    setPromptLocal(v)
    persistChange?.({ prompt: v })
  }
  const setModel = (v: string) => {
    setModelLocal(v)
    persistChange?.({ model: v })
  }

  const isAuto      = mode === "auto"
  const canSubmit   = prompt.trim().length > 0
  const buttonLabel = isAuto ? "Save" : "Generate"

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
          placeholder
            ? (isAuto ? placeholder.auto : placeholder.manual)
            : isAuto
              ? "Set a fixed prompt — the node will run this automatically…"
              : "Describe the text content you want to generate…"
        }
        readOnly={isGenerating}
        minHeight={100}
      />
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown models={TEXT_MODELS} value={model} onChange={setModel} locked={isGenerating} />
        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-500 hover:bg-red-100 border border-red-200/80 active:scale-95 transition-all duration-150"
          >
            <Square size={10} className="fill-red-500" />
            Stop
          </button>
        ) : (
          <button
            disabled={!canSubmit}
            onClick={() => onGenerate(prompt, model, {})}
            className={cn(
              "ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150",
              canSubmit
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95"
                : "text-slate-300 cursor-not-allowed",
            )}
          >
            {isAuto ? <Sparkles size={11} /> : <Zap size={11} />}
            {buttonLabel}
            {!isAuto && (
              <span className={cn("ml-0.5 font-normal", canSubmit ? "text-slate-400" : "text-slate-200")}>
                ~1
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// GenerateImagePanel
// ─────────────────────────────────────────────
// MVP: cheap OpenRouter image models (chat/completions + modalities)
const IMAGE_MODELS = [
  { id: "seedream-4.5", name: "Seedream 4.5" },
]

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
  const editorRef = useRef<RefPromptEditorHandle>(null)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => {
    setPromptLocal(v)
    persistChange?.({ prompt: v })
  }
  const setModel = (v: string) => {
    setModelLocal(v)
    persistChange?.({ model: v })
  }

  const isAuto      = mode === "auto"
  const canSubmit   = prompt.trim().length > 0
  const ActionIcon  = hasSrc ? RefreshCw : isAuto ? Sparkles : Zap
  const buttonLabel = isAuto ? "Save" : hasSrc ? "Regenerate" : "Generate"

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
          isAuto
            ? "Set a fixed prompt — the node will run this automatically…"
            : hasSrc
              ? "Describe how to edit this image…"
              : "Describe the image you want to generate…"
        }
        readOnly={isGenerating}
        minHeight={100}
      />
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown models={IMAGE_MODELS} value={model} onChange={setModel} locked={isGenerating} />
        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-500 hover:bg-red-100 border border-red-200/80 active:scale-95 transition-all duration-150"
          >
            <Square size={10} className="fill-red-500" />
            Stop
          </button>
        ) : (
          <button
            disabled={!canSubmit}
            onClick={() => onGenerate(prompt, model, {})}
            className={cn(
              "ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150",
              canSubmit
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95"
                : "text-slate-300 cursor-not-allowed",
            )}
          >
            <ActionIcon size={11} />
            {buttonLabel}
            {!isAuto && (
              <span className={cn("ml-0.5 font-normal", canSubmit ? "text-slate-400" : "text-slate-200")}>
                {"~$0.01"}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// GenerateVideoPanel
// ─────────────────────────────────────────────
const VIDEO_MODELS = [
  { id: "kling-1.5-pro", name: "Kling 1.5 Pro" },
  { id: "runway-gen3",   name: "Runway Gen-3"   },
  { id: "pika-2.0",      name: "Pika 2.0"       },
  { id: "sora",          name: "Sora"            },
]

const VIDEO_PARAMS: ParamDef[] = [
  { id: "duration", label: "Duration", options: ["3s", "5s", "8s", "10s"]                         },
  { id: "fps",      label: "FPS",      options: ["24", "30", "60"]                                 },
  { id: "style",    label: "Style",    options: ["Cinematic", "Anime", "3D Render", "Documentary"] },
]

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
  // 默认参数值
  const defaultParams = Object.fromEntries(VIDEO_PARAMS.map((p) => [p.id, p.options[0]]))

  // Local state for responsive UI — initialized once from data (key-remount handles node switching)
  const [prompt, setPromptLocal] = useState(data.prompt ?? "")
  const [model,  setModelLocal]  = useState(data.model  ?? VIDEO_MODELS[0].id)
  const [params, setParamsLocal] = useState<Record<string, string>>(data.params ?? defaultParams)
  const editorRef = useRef<RefPromptEditorHandle>(null)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => {
    setPromptLocal(v)
    persistChange?.({ prompt: v })
  }
  const setModel = (v: string) => {
    setModelLocal(v)
    persistChange?.({ model: v })
  }
  const setParams = (p: Record<string, string>) => {
    setParamsLocal(p)
    persistChange?.({ params: p })
  }

  const handleParamChange = (id: string, val: string) => {
    const newParams = { ...params, [id]: val }
    setParams(newParams)
  }

  const isAuto      = mode === "auto"
  const canSubmit   = prompt.trim().length > 0
  const ActionIcon  = isAuto ? Sparkles : Zap
  const buttonLabel = isAuto ? "Save" : hasSrc ? "Regenerate" : "Generate"

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
          isAuto
            ? "Set a fixed prompt — the node will run this automatically…"
            : hasSrc
              ? "Describe the motion or scene transformation…"
              : "Describe the video you want to generate…"
        }
        readOnly={isGenerating}
        minHeight={100}
      />
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown models={VIDEO_MODELS} value={model} onChange={setModel} locked={isGenerating} />
        <ParamDropdowns
          params={VIDEO_PARAMS}
          selected={params}
          onChange={handleParamChange}
          locked={isGenerating}
        />
        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-500 hover:bg-red-100 border border-red-200/80 active:scale-95 transition-all duration-150"
          >
            <Square size={10} className="fill-red-500" />
            Stop
          </button>
        ) : (
          <button
            disabled={!canSubmit}
            onClick={() => onGenerate(prompt, model, params)}
            className={cn(
              "ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150",
              canSubmit
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95"
                : "text-slate-300 cursor-not-allowed",
            )}
          >
            <ActionIcon size={11} />
            {buttonLabel}
            {!isAuto && (
              <span className={cn("ml-0.5 font-normal", canSubmit ? "text-slate-400" : "text-slate-200")}>
                ~$0.20
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// InstancesBox — sits to the right of the loop prompt textarea
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
// LoopPanel — prompt + InstancesBox side-by-side
// ─────────────────────────────────────────────
const LOOP_MODELS = [
  { id: "gemini-2.0-flash",  name: "Gemini 2.0 Flash"  },
  { id: "gemini-1.5-pro",    name: "Gemini 1.5 Pro"    },
  { id: "gpt-4o",            name: "GPT-4o"             },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet"  },
]

const LOOP_PARAMS: ParamDef[] = [
  { id: "variation", label: "Variation", options: ["Low", "Medium", "High"] },
  { id: "strategy",  label: "Strategy",  options: ["Sequential", "Parallel", "Random"] },
]

export function LoopPanel({
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
  // 默认参数值
  const defaultParams = Object.fromEntries(LOOP_PARAMS.map((p) => [p.id, p.options[0]]))

  // Local state for responsive UI — initialized once from data (key-remount handles node switching)
  const [prompt, setPromptLocal]               = useState(data.templatePrompt ?? data.prompt ?? "")
  const [model, setModelLocal]                 = useState(data.model ?? LOOP_MODELS[0].id)
  const [params, setParamsLocal]               = useState<Record<string, string>>(data.params ?? defaultParams)
  const [instanceCount, setInstanceCountLocal] = useState(data.loopCount ?? 3)
  const editorRef = useRef<RefPromptEditorHandle>(null)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => {
    setPromptLocal(v)
    persistChange?.({ templatePrompt: v, prompt: v })
  }

  // Insert chip at current cursor position inside the editor
  const handleInsertReference = useCallback((ref: string) => {
    const nodeId = ref.replace(/^\{\{/, '').replace(/\}\}$/, '')
    editorRef.current?.insertReference(nodeId)
  }, [])
  const setModel = (v: string) => {
    setModelLocal(v)
    persistChange?.({ model: v })
  }
  const setParams = (p: Record<string, string>) => {
    setParamsLocal(p)
    persistChange?.({ params: p })
  }
  const setInstanceCount = (n: number) => {
    setInstanceCountLocal(n)
    persistChange?.({ loopCount: n })
  }

  const handleParamChange = (id: string, val: string) => {
    const newParams = { ...params, [id]: val }
    setParams(newParams)
  }

  const isAuto    = mode === "auto"
  const canSubmit = prompt.trim().length > 0

  const handleGenerate = () => {
    onGenerate(prompt, model, {
      ...params,
      instanceMax: String(instanceCount),
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
            isAuto
              ? "Set the iteration rule — describe how the Seed should vary each run…"
              : "Describe the loop behavior, e.g. 'Generate 5 variations with increasing formality'…"
          }
          readOnly={isGenerating}
          minHeight={110}
          className="flex-1"
        />

        <InstancesBox
          count={instanceCount}
          onChange={setInstanceCount}
          locked={isGenerating}
          theme="indigo"
          label="Instances"
        />
      </div>

      {/* Footer bar — model + params + instance chip + run button */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown models={LOOP_MODELS} value={model} onChange={setModel} locked={isGenerating} />
        <ParamDropdowns
          params={LOOP_PARAMS}
          selected={params}
          onChange={handleParamChange}
          locked={isGenerating}
        />

        {/* Instance summary chip */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 border border-indigo-100/80">
          <Infinity size={10} className="text-indigo-400" strokeWidth={2.5} />
          <span className="text-[11px] text-indigo-500 font-medium">
            ≤ {instanceCount} runs
          </span>
        </div>

        {isGenerating ? (
          <button
            onClick={onStop}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-500 hover:bg-red-100 border border-red-200/80 active:scale-95 transition-all duration-150"
          >
            <Square size={10} className="fill-red-500" />
            Stop
          </button>
        ) : (
          <button
            disabled={!canSubmit}
            onClick={handleGenerate}
            className={cn(
              "ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150",
              canSubmit
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95"
                : "text-slate-300 cursor-not-allowed",
            )}
          >
            {isAuto ? <Sparkles size={11} /> : <Zap size={11} />}
            {isAuto ? "Save" : "Run Loop"}
          </button>
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

