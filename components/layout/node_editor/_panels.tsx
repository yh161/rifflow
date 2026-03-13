"use client"

import React, { useState, useRef, useLayoutEffect, useCallback } from "react"
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

// Re-export for any existing consumers
export type { NodeMode }

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
  onDataChange,
  mode,
  isGenerating,
  onGenerate,
  onStop,
  placeholder,
}: {
  data: CustomNodeData
  nodeId?: string
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Insert reference at cursor position
  const handleInsertReference = useCallback((ref: string) => {
    if (!textareaRef.current) {
      setPrompt(prompt + ref)
      return
    }
    
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newPrompt = prompt.slice(0, start) + ref + prompt.slice(end)
    setPrompt(newPrompt)
    
    // Move cursor after inserted reference
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + ref.length, start + ref.length)
    })
  }, [prompt, setPrompt])

  return (
    <div className="flex flex-col">
      {/* Upstream reference area */}
      {nodeId && (
        <UpstreamReference
          nodeId={nodeId}
          onInsertReference={handleInsertReference}
        />
      )}
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => !isGenerating && setPrompt(e.target.value)}
        placeholder={
          placeholder
            ? (isAuto ? placeholder.auto : placeholder.manual)
            : isAuto
              ? "Set a fixed prompt — the node will run this automatically…"
              : "Describe the text content you want to generate…"
        }
        rows={4}
        readOnly={isGenerating}
        className={cn(
          "w-full resize-none p-3 text-sm text-slate-700 outline-none placeholder:text-slate-300 leading-relaxed",
          isGenerating && "opacity-40 cursor-not-allowed",
        )}
        style={{ minHeight: 100 }}
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Insert reference at cursor position
  const handleInsertReference = useCallback((ref: string) => {
    if (!textareaRef.current) {
      setPrompt(prompt + ref)
      return
    }
    
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newPrompt = prompt.slice(0, start) + ref + prompt.slice(end)
    setPrompt(newPrompt)
    
    // Move cursor after inserted reference
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + ref.length, start + ref.length)
    })
  }, [prompt, setPrompt])

  return (
    <div className="flex flex-col">
      {/* Upstream reference area */}
      {nodeId && (
        <UpstreamReference
          nodeId={nodeId}
          onInsertReference={handleInsertReference}
        />
      )}
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => !isGenerating && setPrompt(e.target.value)}
        placeholder={
          isAuto
            ? "Set a fixed prompt — the node will run this automatically…"
            : hasSrc
              ? "Describe how to edit this image…"
              : "Describe the image you want to generate…"
        }
        rows={4}
        readOnly={isGenerating}
        className={cn(
          "w-full resize-none p-3 text-sm text-slate-700 outline-none placeholder:text-slate-300 leading-relaxed",
          isGenerating && "opacity-40 cursor-not-allowed",
        )}
        style={{ minHeight: 100 }}
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
  onDataChange,
  hasSrc,
  mode,
  isGenerating,
  onGenerate,
  onStop,
}: {
  data: CustomNodeData
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

  return (
    <div className="flex flex-col">
      <textarea
        value={prompt}
        onChange={(e) => !isGenerating && setPrompt(e.target.value)}
        placeholder={
          isAuto
            ? "Set a fixed prompt — the node will run this automatically…"
            : hasSrc
              ? "Describe the motion or scene transformation…"
              : "Describe the video you want to generate…"
        }
        rows={4}
        readOnly={isGenerating}
        className={cn(
          "w-full resize-none p-3 text-sm text-slate-700 outline-none placeholder:text-slate-300 leading-relaxed",
          isGenerating && "opacity-40 cursor-not-allowed",
        )}
        style={{ minHeight: 100 }}
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
  onDataChange,
  mode,
  isGenerating,
  onGenerate,
  onStop,
}: {
  data: CustomNodeData
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
  const [prompt, setPromptLocal]               = useState(data.loopPrompt ?? data.prompt ?? "")
  const [model, setModelLocal]                 = useState(data.model ?? LOOP_MODELS[0].id)
  const [params, setParamsLocal]               = useState<Record<string, string>>(data.params ?? defaultParams)
  const [instanceCount, setInstanceCountLocal] = useState(data.loopCount ?? 3)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => {
    setPromptLocal(v)
    persistChange?.({ loopPrompt: v, prompt: v })
  }
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
      {/* Top area: prompt left, instances right */}
      <div className="flex min-h-[110px]">
        <textarea
          value={prompt}
          onChange={(e) => !isGenerating && setPrompt(e.target.value)}
          placeholder={
            isAuto
              ? "Set the iteration rule — describe how the Seed should vary each run…"
              : "Describe the loop behavior, e.g. 'Generate 5 variations with increasing formality'…"
          }
          readOnly={isGenerating}
          className={cn(
            "flex-1 resize-none p-3 text-sm text-slate-700 outline-none placeholder:text-slate-300 leading-relaxed",
            isGenerating && "opacity-40 cursor-not-allowed",
          )}
          style={{ minHeight: 110 }}
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

// ─────────────────────────────────────────────
// CyclePanel — instances only (no prompt)
// Cycle has no LLM-driven variation — just iteration count control.
// ─────────────────────────────────────────────
export function CyclePanel({
  data,
  onDataChange,
  isGenerating,
  onStop,
}: {
  data: CustomNodeData
  /** Direct callback — preferred over data.onDataChange to avoid async injection timing. */
  onDataChange?: (u: Partial<CustomNodeData>) => void
  mode: NodeMode
  isGenerating: boolean
  onGenerate: (prompt: string, model: string, params: Record<string, string>) => void
  onStop: () => void
}) {
  // Local state for responsive UI — initialized once from data (key-remount handles node switching)
  const [instanceCount, setInstanceCountLocal] = useState(data.loopCount ?? 3)

  // Prefer the direct prop; fall back to data.onDataChange for legacy callers
  const persistChange = onDataChange ?? data.onDataChange

  const setInstanceCount = (n: number) => {
    setInstanceCountLocal(n)
    persistChange?.({ loopCount: n })
  }

  return (
    <div className="flex flex-col">
      {/* Top area: hint left, instances right */}
      <div className="flex min-h-[140px]">
        {/* Left: usage hint */}
        <div className="flex-1 p-4 flex flex-col justify-center gap-3">
          <p className="text-xs text-slate-400 leading-relaxed">
            Connect internal nodes to the{" "}
            <span className="text-violet-400 font-medium">↻ re-enter</span> and{" "}
            <span className="text-violet-400 font-medium">exit ↵</span>{" "}
            handles inside the frame to define the loop path.
          </p>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Use a <span className="text-slate-400 font-medium">Gate</span> node to control exit conditions — without one the cycle will always run to the maximum count.
          </p>
        </div>

        {/* Right: instances count */}
        <InstancesBox
          count={instanceCount}
          onChange={setInstanceCount}
          locked={isGenerating}
          theme="violet"
          label="Cycles"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100">
        {/* Instance summary chip */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-50 border border-violet-100/80">
          <Infinity size={10} className="text-violet-400" strokeWidth={2.5} />
          <span className="text-[11px] text-violet-500 font-medium">
            ≤ {instanceCount} cycles
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
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80 active:scale-95 transition-all duration-150"
          >
            <Zap size={11} />
            Set
          </button>
        )}
      </div>
    </div>
  )
}
