"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import type { WorkflowTask } from "./run-detail"

function StatusIcon({ status }: { status: WorkflowTask["status"] }) {
  if (status === "done")    return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
  if (status === "running") return <Loader2 size={14} className="text-blue-500 shrink-0 animate-spin" />
  if (status === "error")   return <AlertCircle size={14} className="text-red-500 shrink-0" />
  if (status === "warn")    return <AlertCircle size={14} className="text-amber-400 shrink-0" />
  return null
}

export function RunDetailTaskItem({ task }: { task: WorkflowTask }) {
  const isActive = task.status === "running"

  return (
    <div className={cn(
      "flex items-center gap-3 px-5 py-2.5 transition-colors duration-200",
      isActive && "bg-blue-50/60",
    )}>
      {/* Index or status icon */}
      <div className="w-5 flex items-center justify-center shrink-0">
        {task.status === "pending" ? (
          <span className="text-[12px] text-slate-300 tabular-nums font-medium">{task.index}</span>
        ) : (
          <StatusIcon status={task.status} />
        )}
      </div>

      {/* Label + node */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-[13px] font-medium truncate leading-tight",
          task.status === "pending" ? "text-slate-300" :
          isActive                  ? "text-blue-600"  : "text-slate-800",
        )}>
          {task.label}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-slate-400 font-mono truncate">{task.nodeId}</span>
          {task.detail && task.status !== "pending" && (
            <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">
              {task.detail}
            </span>
          )}
        </div>
      </div>

      {/* Duration */}
      <div className="shrink-0 w-10 text-right">
        {task.status === "done" && task.duration !== undefined && (
          <span className="text-[10px] text-slate-300 tabular-nums font-mono">
            {task.duration < 1000 ? `${task.duration}ms` : `${(task.duration / 1000).toFixed(1)}s`}
          </span>
        )}
        {isActive && (
          <span className="text-[10px] text-blue-400 animate-pulse">···</span>
        )}
      </div>
    </div>
  )
}
