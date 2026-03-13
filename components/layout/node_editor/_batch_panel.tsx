"use client"

import React, { useState, useRef, useCallback } from "react"
import { Sparkles, Zap, Square, Infinity, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import * as SliderPrimitive from "@radix-ui/react-slider"
import type { CustomNodeData, NodeMode } from "../modules/_types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UpstreamReference } from "./_upstream_reference"

// ─────────────────────────────────────────────
// BatchPanel — LLM-driven batch generation
// ─────────────────────────────────────────────

const BATCH_MODELS = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
]

interface BatchConfig {
  count: number
  seeds: Array<{
    content: string
    description?: string
  }>
}

interface BatchPanelProps {
  data: CustomNodeData
  nodeId?: string
  onDataChange?: (u: Partial<CustomNodeData>) => void
  mode: NodeMode
  isGenerating: boolean
  onGenerate: (prompt: string, model: string, maxInstances: number) => void
  onStop: () => void
}

export function BatchPanel({
  data,
  nodeId,
  onDataChange,
  mode,
  isGenerating,
  onGenerate,
  onStop,
}: BatchPanelProps) {
  // Local state
  const [prompt, setPromptLocal] = useState(data.batchPrompt ?? data.prompt ?? "")
  const [model, setModelLocal] = useState(data.model ?? BATCH_MODELS[0].id)
  const [maxInstances, setMaxInstancesLocal] = useState(data.loopCount ?? 5)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const persistChange = onDataChange ?? data.onDataChange

  const setPrompt = (v: string) => {
    setPromptLocal(v)
    persistChange?.({ batchPrompt: v, prompt: v })
  }

  const setModel = (v: string) => {
    setModelLocal(v)
    persistChange?.({ model: v })
  }

  const setMaxInstances = (n: number) => {
    setMaxInstancesLocal(n)
    persistChange?.({ loopCount: n })
  }

  const isAuto = mode === "auto"
  const canSubmit = prompt.trim().length > 0 && !isGenerating

  // Insert reference at cursor position
  const handleInsertReference = useCallback(
    (ref: string) => {
      if (!textareaRef.current) {
        setPrompt(prompt + ref)
        return
      }

      const textarea = textareaRef.current
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newPrompt = prompt.slice(0, start) + ref + prompt.slice(end)
      setPrompt(newPrompt)

      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(start + ref.length, start + ref.length)
      })
    },
    [prompt, setPrompt]
  )

  const handleGenerate = () => {
    onGenerate(prompt, model, maxInstances)
  }

  return (
    <div className="flex flex-col">
      {/* Top area: prompt left, max instances right */}
      <div className="flex min-h-[110px]">
        <div className="flex-1 flex flex-col">
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
                ? "Set the batch rule — describe how to generate multiple variations..."
                : "Describe how to create multiple instances, e.g., 'Generate 3 different product descriptions highlighting different features'..."
            }
            readOnly={isGenerating}
            className={cn(
              "w-full flex-1 resize-none p-3 text-sm text-slate-700 outline-none placeholder:text-slate-300 leading-relaxed",
              isGenerating && "opacity-40 cursor-not-allowed"
            )}
            style={{ minHeight: 110 }}
          />
        </div>

        {/* Max Instances Box */}
        <MaxInstancesBox
          count={maxInstances}
          onChange={setMaxInstances}
          locked={isGenerating}
        />
      </div>

      {/* Footer bar */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100 flex-wrap">
        <ModelDropdown
          models={BATCH_MODELS}
          value={model}
          onChange={setModel}
          locked={isGenerating}
        />

        {/* Instance summary chip */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 border border-indigo-100/80">
          <Wand2 size={10} className="text-indigo-400" strokeWidth={2.5} />
          <span className="text-[11px] text-indigo-500 font-medium">
            max {maxInstances}
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
                : "text-slate-300 cursor-not-allowed"
            )}
          >
            {isAuto ? <Sparkles size={11} /> : <Zap size={11} />}
            {isAuto ? "Save" : "Generate Batch"}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MaxInstancesBox — simplified from InstancesBox
// ─────────────────────────────────────────────
function MaxInstancesBox({
  count,
  onChange,
  locked,
}: {
  count: number
  onChange: (count: number) => void
  locked?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 w-[140px] flex-shrink-0 px-3 py-3 border-l border-slate-100">
      {/* Header */}
      <span className="text-[10px] font-semibold tracking-widest uppercase select-none text-indigo-400">
        Max Limit
      </span>

      {/* Big number display */}
      <div className="flex items-baseline justify-center gap-1">
        <span
          className={cn(
            "font-semibold tabular-nums leading-none transition-all duration-150",
            count >= 10 ? "text-3xl" : "text-4xl",
            "text-indigo-500"
          )}
        >
          {count}
        </span>
        <span className="text-[11px] font-medium text-indigo-300">max</span>
      </div>

      {/* Slider */}
      <SliderPrimitive.Root
        min={1}
        max={20}
        step={1}
        value={[count]}
        disabled={locked}
        onValueChange={([v]) => onChange(v)}
        className={cn(
          "relative flex items-center select-none touch-none w-full h-5",
          locked && "opacity-40 pointer-events-none"
        )}
      >
        <SliderPrimitive.Track className="relative rounded-full flex-1 h-1.5 overflow-hidden bg-indigo-100">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-indigo-400" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cn(
            "block w-4 h-4 rounded-full bg-white shadow-md border-2 border-indigo-400",
            "outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400",
            "transition-transform duration-100 hover:scale-110 active:scale-125",
            "cursor-grab active:cursor-grabbing"
          )}
        />
      </SliderPrimitive.Root>

      {/* Min / Max labels */}
      <div className="flex justify-between text-[10px] font-medium tabular-nums px-0.5 -mt-1 text-indigo-200">
        <span>1</span>
        <span>20</span>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-slate-300 leading-relaxed">
        Hard limit — LLM generates up to this count.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────
// ModelDropdown
// ─────────────────────────────────────────────
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
              : "hover:bg-slate-100/80 hover:border-slate-200/80"
          )}
        >
          {name}
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
