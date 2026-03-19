"use client"

import React, { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { ChevronUp } from "lucide-react"
import type { WorkflowMeta, WorkflowTask } from "./run-detail"

const GRADIENTS = [
  ["#667eea", "#764ba2"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#43e97b", "#38f9d7"],
  ["#fa709a", "#fee140"],
  ["#a18cd1", "#fbc2eb"],
]
function coverGradient(name: string) {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % GRADIENTS.length
  const [from, to] = GRADIENTS[idx]
  return `linear-gradient(135deg, ${from}, ${to})`
}

interface RunDetailPillProps {
  meta: WorkflowMeta
  tasks: WorkflowTask[]
  elapsedTime: number
  onOpenLog: () => void
}

export function RunDetailPill({ meta, tasks, elapsedTime, onOpenLog }: RunDetailPillProps) {
  const done       = tasks.filter(t => t.status === "done").length
  const total      = tasks.length
  const pct        = total === 0 ? 0 : (done / total) * 100
  const isComplete = total > 0 && done === total
  const hasError   = tasks.some(t => t.status === "error")
  const isRunning  = tasks.some(t => t.status === "running")
  const current    = tasks.find(t => t.status === "running")

  const [showTask, setShowTask] = useState(false)

  useEffect(() => {
    if (!isRunning || !current) { setShowTask(false); return }
    const iv = setInterval(() => setShowTask(v => !v), 3000)
    return () => clearInterval(iv)
  }, [isRunning, !!current])

  const fillColor = hasError
    ? "rgba(239,68,68,0.18)"
    : isComplete
      ? "rgba(52,211,153,0.18)"
      : "rgba(96,165,250,0.15)"

  return (
    <button
      onClick={onOpenLog}
      className="w-full relative overflow-hidden rounded-[22px] active:scale-[0.98] transition-transform duration-150"
      style={{
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.75)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      {/* ── Liquid fill ── */}
      <div
        className="absolute inset-y-0 left-0 transition-all duration-1000 ease-out"
        style={{
          width: `${pct}%`,
          background: fillColor,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* ── Content ── */}
      <div className="relative flex items-center gap-3 px-3 py-2.5">
        {/* Cover thumbnail */}
        <div
          className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm overflow-hidden"
          style={{ background: meta.coverImage ? undefined : coverGradient(meta.name) }}
        >
          {meta.coverImage ? (
            <img src={meta.coverImage} alt={meta.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white/30 font-bold text-[18px] select-none">
              {meta.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Cycling text */}
        <div className="flex-1 min-w-0 relative" style={{ height: 36 }}>
          {/* Workflow meta */}
          <div className={cn(
            "absolute inset-0 flex flex-col justify-center transition-opacity duration-500",
            showTask && current ? "opacity-0" : "opacity-100",
          )}>
            <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{meta.name}</p>
            <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">{meta.author}</p>
          </div>
          {/* Current task */}
          <div className={cn(
            "absolute inset-0 flex flex-col justify-center transition-opacity duration-500",
            showTask && current ? "opacity-100" : "opacity-0",
          )}>
            <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{current?.label}</p>
            <p className="text-[11px] text-slate-500 font-mono truncate leading-tight mt-0.5">{current?.nodeId}</p>
          </div>
        </div>

        {/* Arrow to screen 2 */}
        <ChevronUp size={14} className="text-slate-400 shrink-0" />
      </div>
    </button>
  )
}
