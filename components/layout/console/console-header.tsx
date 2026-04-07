"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Clock, Zap } from "lucide-react"
import type { ConsolePhase } from "./console-types"

interface ConsoleHeaderProps {
  phase: ConsolePhase
  elapsed: number
  taskCount: number
  doneCount: number
  spentCredits: number
  budgetMin: number
  budgetMax: number
  isBudgetRange: boolean
}

export function ConsoleHeader({
  phase,
  elapsed,
  taskCount,
  doneCount,
  spentCredits,
  budgetMin,
  budgetMax,
  isBudgetRange,
}: ConsoleHeaderProps) {
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`

  const statusLabel =
    phase === "complete"
      ? "Complete"
      : phase === "paused_manual"
        ? "Manual Input"
        : (phase === "paused")
          ? "Paused"
          : phase === "running"
            ? "Running"
            : phase === "error"
              ? "Error"
              : phase === "stopped"
                ? "Stopped"
                : "Ready"

  const statusDot =
    phase === "complete"
      ? "bg-emerald-400"
      : phase === "paused_manual"
        ? "bg-amber-400"
        : phase === "paused"
          ? "bg-amber-400"
          : phase === "running"
            ? "bg-blue-400 animate-pulse"
            : phase === "error"
              ? "bg-red-400"
              : "bg-slate-300"

  const budgetText = (() => {
    if (phase === "ready") {
      if (isBudgetRange) return `${budgetMin} ~ ${budgetMax} credits`
      return `${budgetMax} credits`
    }

    if (phase === "running" || phase === "paused" || phase === "paused_manual") {
      if (isBudgetRange) return `${spentCredits} used · ${budgetMin} ~ ${budgetMax}`
      return `${spentCredits} / ${budgetMax} credits`
    }

    if (phase === "complete") return `${spentCredits} credits`
    return `${spentCredits} used`
  })()

  return (
    <div className="px-5 pt-2 pb-3">
      {/* Album cover */}
      <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden mb-4 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 shadow-lg">
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 left-4 w-20 h-20 border border-white/30 rounded-full" />
          <div className="absolute bottom-6 right-6 w-32 h-32 border border-white/20 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 border-2 border-white/40 rounded-lg rotate-45" />
        </div>

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center",
            phase === "complete"
              ? "bg-emerald-500/20 backdrop-blur-sm"
              : "bg-white/10 backdrop-blur-sm",
          )}>
            <Zap
              size={24}
              className={cn(
                "transition-colors duration-500",
                phase === "complete" ? "text-emerald-400" : "text-white/80",
              )}
            />
          </div>
        </div>

        {/* Bottom info bar */}
        <div className="absolute bottom-0 inset-x-0 px-4 py-2.5 bg-gradient-to-t from-black/50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-white/80">
              Workflow
            </span>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full", statusDot)} />
              <span className="text-[10px] font-medium text-white/70">{statusLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium text-slate-500 tabular-nums">
            {doneCount} / {taskCount} tasks
          </span>
          <span className="text-[11px] font-medium text-slate-500 tabular-nums">
            ⚡ {budgetText}
          </span>
        </div>
        {phase !== "ready" && (
          <div className="flex items-center gap-1 text-slate-400">
            <Clock size={10} />
            <span className="text-[11px] font-mono tabular-nums">{timeStr}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            phase === "complete" ? "bg-emerald-400" : "bg-blue-400",
          )}
          style={{ width: `${taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100)}%` }}
        />
      </div>
    </div>
  )
}
