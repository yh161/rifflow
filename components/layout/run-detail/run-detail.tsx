"use client"

import React, { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { ChevronLeft, MoreHorizontal } from "lucide-react"
import { RunDetailHeader } from "./run-detail-header"
import { RunDetailActions } from "./run-detail-actions"
import { RunDetailTasks } from "./run-detail-tasks"
import { RunDetailLog } from "./run-detail-log"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface WorkflowMeta {
  id: string
  name: string
  author: string
  type: string
  createdAt: Date
  coverImage?: string
}

export type TaskStatus = "pending" | "running" | "done" | "error" | "warn"

export interface WorkflowTask {
  id: string
  index: number
  label: string
  nodeId: string
  nodeType: string
  status: TaskStatus
  duration?: number
  detail?: string
}

// ─────────────────────────────────────────────
// Demo data
// ─────────────────────────────────────────────
const DEMO_META: WorkflowMeta = {
  id: "demo-001",
  name: "Workflow Run",
  author: "You",
  type: "Batch",
  createdAt: new Date(),
}

const DEMO_TASKS: Omit<WorkflowTask, "status" | "duration">[] = [
  { id: "t1", index: 1, label: "Initialize context",  nodeId: "system",   nodeType: "system"  },
  { id: "t2", index: 2, label: "Load entities",       nodeId: "entity-1", nodeType: "entity",  detail: "3 records"  },
  { id: "t3", index: 3, label: "Process text",        nodeId: "text-1",   nodeType: "text",    detail: "Gemini 2.0" },
  { id: "t4", index: 4, label: "Generate image",      nodeId: "image-1",  nodeType: "image",   detail: "FLUX"       },
  { id: "t5", index: 5, label: "Compile output",      nodeId: "output-1", nodeType: "output"  },
]

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface RunDetailProps {
  isVisible: boolean
  isRunning: boolean
  isPaused: boolean
  onRun: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onOpenLog?: () => void
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function RunDetail({
  isVisible,
  isRunning,
  isPaused,
  onRun,
  onPause,
  onResume,
  onStop,
  onOpenLog,
}: RunDetailProps) {
  const [tasks, setTasks] = useState<WorkflowTask[]>(
    DEMO_TASKS.map(t => ({ ...t, status: "pending" }))
  )
  const [elapsed, setElapsed] = useState(0)
  const [showLog, setShowLog] = useState(false)
  const stepTimerRef    = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentStepRef  = useRef(0)
  const startTimeRef    = useRef(0)

  useEffect(() => {
    if (!isRunning) {
      setTasks(DEMO_TASKS.map(t => ({ ...t, status: "pending" })))
      currentStepRef.current = 0
      setElapsed(0)
      if (stepTimerRef.current)    clearTimeout(stepTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      return
    }
    if (isPaused) return

    startTimeRef.current = Date.now()
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    const advance = () => {
      const i = currentStepRef.current
      if (i >= DEMO_TASKS.length) return
      setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "running" } : t))
      const stepStart = Date.now()
      stepTimerRef.current = setTimeout(() => {
        const dur = Date.now() - stepStart
        setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, status: "done", duration: dur } : t))
        currentStepRef.current++
        advance()
      }, 900 + Math.random() * 1400)
    }

    advance()

    return () => {
      if (stepTimerRef.current)    clearTimeout(stepTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    }
  }, [isRunning, isPaused])

  return (
    <div className={cn(
      "w-full h-full flex flex-col bg-white overflow-hidden relative",
      "transition-opacity duration-300",
      isVisible ? "opacity-100" : "opacity-0 pointer-events-none",
    )}>
      {/* ── Fixed top nav ── */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0">
        <button
          onClick={onStop}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <span className="text-[13px] font-semibold text-slate-600">{DEMO_META.type}</span>
        <button className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="run-detail-scroll flex-1 overflow-y-auto min-h-0">
        <RunDetailHeader meta={DEMO_META} />
        <RunDetailActions
          isRunning={isRunning}
          isPaused={isPaused}
          onRun={onRun}
          onPause={onPause}
          onResume={onResume}
        />
        <div className="mx-5 h-px bg-slate-100" />
        <RunDetailTasks tasks={tasks} />
        <div className="h-24" /> {/* spacer for pill */}
      </div>

      {/* ── Pill ↔ Log (single morphing element) ── */}
      <RunDetailLog
        isOpen={showLog}
        meta={DEMO_META}
        tasks={tasks}
        elapsedTime={elapsed}
        onOpen={() => setShowLog(true)}
        onClose={() => setShowLog(false)}
      />
    </div>
  )
}
