"use client"

import React from "react"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  SkipForward,
  Hand,
  Bot,
  StickyNote,
} from "lucide-react"
import { MODULE_BY_ID } from "../modules/_registry"
import type { ConsoleTask, TaskStatus } from "./console-types"

// ─────────────────────────────────────────────
// Status icon
// ─────────────────────────────────────────────
function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done") return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
  if (status === "running") return <Loader2 size={14} className="text-blue-500 shrink-0 animate-spin" />
  if (status === "error") return <AlertCircle size={14} className="text-red-500 shrink-0" />
  if (status === "skipped") return <SkipForward size={12} className="text-slate-300 shrink-0" />
  if (status === "waiting_manual") return <Hand size={14} className="text-amber-500 shrink-0" />
  return <Circle size={14} className="text-slate-200 shrink-0" />
}

// ─────────────────────────────────────────────
// Mode badge
// ─────────────────────────────────────────────
function ModeBadge({ mode }: { mode: "auto" | "manual" | "note" }) {
  if (mode === "auto") {
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-medium text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">
        <Bot size={8} /> Auto
      </span>
    )
  }
  if (mode === "manual") {
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
        <Hand size={8} /> Manual
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-[9px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full">
      <StickyNote size={8} /> Note
    </span>
  )
}

// ─────────────────────────────────────────────
// ConsoleTaskItem
// ─────────────────────────────────────────────
interface ConsoleTaskItemProps {
  task: ConsoleTask
  isActive: boolean
  isExpanded: boolean
  onClick: () => void
  children?: React.ReactNode // embedded editor panel for manual nodes
}

export function ConsoleTaskItem({
  task,
  isActive,
  isExpanded,
  onClick,
  children,
}: ConsoleTaskItemProps) {
  const mod = MODULE_BY_ID[task.type]
  const Icon = mod?.meta?.icon
  const color = mod?.meta?.color ?? "text-slate-400"

  return (
    <div
      className={cn(
        "transition-all duration-300",
        isActive && "bg-blue-50/60",
        task.status === "done" && "bg-emerald-50/30",
      )}
    >
      {/* Task row */}
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2.5 px-4 py-2.5 text-left",
          "transition-colors duration-200 hover:bg-slate-50/50",
        )}
      >
        <StatusIcon status={task.status} />

        {/* Type icon */}
        {Icon && (
          <div className={cn(
            "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
            task.status === "done" ? "bg-emerald-50" : "bg-slate-100",
          )}>
            <Icon size={12} strokeWidth={2} className={task.status === "done" ? "text-emerald-500" : color} />
          </div>
        )}

        {/* Label & meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-[12px] font-medium leading-none truncate",
                task.status === "pending" ? "text-slate-300" : "text-slate-700",
                task.status === "running" && "text-blue-700",
                task.status === "done" && "text-emerald-700",
              )}
            >
              {task.label}
            </span>
            <ModeBadge mode={task.mode} />
          </div>
          <span className="text-[10px] text-slate-300 font-mono mt-0.5 block truncate">
            {task.type} · {task.nodeId.slice(-8)}
          </span>
        </div>

        {/* Duration / status */}
        <div className="shrink-0">
          {task.status === "done" && task.duration !== undefined && (
            <span className="text-[10px] text-slate-300 tabular-nums font-mono">
              {task.duration < 1000
                ? `${task.duration}ms`
                : `${(task.duration / 1000).toFixed(1)}s`}
            </span>
          )}
          {task.status === "running" && (
            <span className="text-[10px] text-blue-400 animate-pulse">···</span>
          )}
          {task.status === "error" && (
            <span className="text-[9px] text-red-400 font-medium">Error</span>
          )}
        </div>
      </button>

      {/* Expanded panel (for manual nodes) */}
      {isExpanded && children && (
        <div className="px-4 pb-3">
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            {children}
          </div>
        </div>
      )}

      {/* Error message */}
      {task.error && (
        <div className="px-4 pb-2">
          <div className="text-[10px] text-red-500 bg-red-50 rounded-lg px-3 py-1.5 border border-red-100">
            {task.error}
          </div>
        </div>
      )}
    </div>
  )
}
