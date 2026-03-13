"use client"

import React, { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronRight,
  Send,
  Clock,
  Zap,
} from "lucide-react"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface LogEntry {
  id: string
  timestamp: Date
  level: "info" | "success" | "warn" | "error" | "input" | "output"
  message: string
  node?: string
}

type StepStatus = "pending" | "running" | "done" | "error" | "warn"

interface WorkflowStep {
  id: string
  label: string
  node: string
  status: StepStatus
  duration?: number
  detail?: string
}

// ─────────────────────────────────────────────
// Demo workflow steps
// ─────────────────────────────────────────────
const DEMO_STEPS: Omit<WorkflowStep, "status" | "duration">[] = [
  { id: "s1", label: "Initialize context",  node: "system"   },
  { id: "s2", label: "Load entities",       node: "entity-1", detail: "3 records" },
  { id: "s3", label: "Process text",        node: "text-1",   detail: "Gemini 2.0" },
  { id: "s4", label: "Generate image",      node: "image-1",  detail: "FLUX" },
  { id: "s5", label: "Compile output",      node: "output-1" },
]

// ─────────────────────────────────────────────
// Step icon
// ─────────────────────────────────────────────
function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done")    return <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
  if (status === "running") return <Loader2 size={15} className="text-blue-500 shrink-0 animate-spin" />
  if (status === "error")   return <AlertCircle size={15} className="text-red-500 shrink-0" />
  if (status === "warn")    return <AlertCircle size={15} className="text-amber-500 shrink-0" />
  return <Circle size={15} className="text-slate-200 shrink-0" />
}

// ─────────────────────────────────────────────
// Single step row
// ─────────────────────────────────────────────
function StepRow({ step }: { step: WorkflowStep }) {
  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2.5 transition-colors duration-300",
      step.status === "running" && "bg-blue-50/70",
    )}>
      <StepIcon status={step.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn(
            "text-[12px] font-medium leading-none",
            step.status === "pending" ? "text-slate-300" : "text-slate-700",
            step.status === "running" && "text-blue-700",
          )}>
            {step.label}
          </span>
          {step.detail && step.status !== "pending" && (
            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded-md">
              {step.detail}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-300 font-mono mt-0.5 block">{step.node}</span>
      </div>

      <div className="shrink-0">
        {step.status === "done" && step.duration !== undefined && (
          <span className="text-[10px] text-slate-300 tabular-nums font-mono">
            {step.duration < 1000 ? `${step.duration}ms` : `${(step.duration / 1000).toFixed(1)}s`}
          </span>
        )}
        {step.status === "running" && (
          <span className="text-[10px] text-blue-400 animate-pulse">···</span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────
function ProgressBar({ steps }: { steps: WorkflowStep[] }) {
  const done = steps.filter(s => s.status === "done").length
  const total = steps.length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-slate-400 tabular-nums">{done} / {total} steps</span>
        <span className="text-[10px] font-mono text-slate-400">{pct}%</span>
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-400 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Console Component
// ─────────────────────────────────────────────
interface RunConsoleProps {
  isVisible: boolean
  isPaused: boolean
  logs: LogEntry[]
  onSendInput?: (text: string) => void
}

export default function RunConsole({ isVisible, isPaused, logs, onSendInput }: RunConsoleProps) {
  const [inputText, setInputText] = useState("")
  const [steps, setSteps] = useState<WorkflowStep[]>(
    DEMO_STEPS.map(s => ({ ...s, status: "pending" }))
  )
  const [elapsed, setElapsed] = useState(0)
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentStepRef = useRef(0)
  const startTimeRef = useRef(0)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Drive step progression
  useEffect(() => {
    if (!isVisible) {
      setSteps(DEMO_STEPS.map(s => ({ ...s, status: "pending" })))
      currentStepRef.current = 0
      setElapsed(0)
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      return
    }
    if (isPaused) return

    startTimeRef.current = Date.now()

    // Elapsed timer
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    const advance = () => {
      const i = currentStepRef.current
      if (i >= DEMO_STEPS.length) return

      setSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: "running" } : s
      ))
      const stepStart = Date.now()
      const duration = 900 + Math.random() * 1400

      stepTimerRef.current = setTimeout(() => {
        const elapsed = Date.now() - stepStart
        setSteps(prev => prev.map((s, idx) =>
          idx === i ? { ...s, status: "done", duration: elapsed } : s
        ))
        currentStepRef.current++
        advance()
      }, duration)
    }

    advance()

    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    }
  }, [isVisible, isPaused])

  const handleSend = () => {
    if (!inputText.trim()) return
    onSendInput?.(inputText)
    setInputText("")
  }

  const allDone = steps.every(s => s.status === "done")
  const hasError = steps.some(s => s.status === "error")
  const statusLabel = hasError ? "Error" : allDone ? "Complete" : isPaused ? "Paused" : "Running"
  const statusDot = hasError ? "bg-red-400" : allDone ? "bg-emerald-400" : isPaused ? "bg-amber-400" : "bg-blue-400 animate-pulse"

  return (
    <div
      className={cn(
        "w-full h-full flex flex-col overflow-hidden bg-white",
        "transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center shadow-sm">
            <Zap size={13} className="text-white" />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-slate-800 leading-none">Workflow Run</div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-mono flex items-center gap-1">
              <Clock size={9} />
              {elapsed}s
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/70 rounded-full px-2.5 py-1">
          <div className={cn("w-1.5 h-1.5 rounded-full", statusDot)} />
          <span className="text-[10px] font-medium text-slate-500">{statusLabel}</span>
        </div>
      </div>

      {/* ── Progress ── */}
      <div className="px-4 pt-3">
        <ProgressBar steps={steps} />
      </div>

      {/* ── Steps ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative py-1">
          {steps.map((step, i) => (
            <div key={step.id}>
              <StepRow step={step} />
              {i < steps.length - 1 && (
                <div className="ml-[26px] w-px h-2 bg-slate-100" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Log tail ── */}
      {logs.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-300 mb-1.5">Recent</div>
          {logs.slice(-3).map(entry => (
            <div key={entry.id} className="flex items-start gap-1.5 py-[2px]">
              <ChevronRight size={9} className="text-slate-300 mt-[3px] shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono leading-relaxed truncate">
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div className="px-3 pb-4 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-200/60">
          <ChevronRight size={12} className="text-slate-300 shrink-0" />
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Send input…"
            className="flex-1 bg-transparent outline-none text-[12px] font-mono text-slate-700 placeholder:text-slate-300 caret-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="p-1 rounded-lg text-slate-400 hover:text-blue-500 disabled:opacity-20 transition-all"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Hook: simulate demo logs
// ─────────────────────────────────────────────
const DEMO_LOG_MESSAGES: Omit<LogEntry, "id" | "timestamp">[] = [
  { level: "info",    message: "Workflow started",             node: "system"   },
  { level: "info",    message: "Initializing graph context…",  node: "system"   },
  { level: "success", message: "Entity loader connected",      node: "entity-1" },
  { level: "info",    message: "Processing text node…",        node: "text-1"   },
  { level: "success", message: "Gemini response received",     node: "text-1"   },
  { level: "warn",    message: "Rate limit approaching",       node: "system"   },
  { level: "info",    message: "Generating image…",            node: "image-1"  },
  { level: "success", message: "FLUX output ready",            node: "image-1"  },
  { level: "output",  message: "Result: 3 entities extracted", node: "output-1" },
]

export function useDemoLogs(isRunning: boolean, isPaused: boolean) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const indexRef = useRef(0)

  useEffect(() => {
    if (!isRunning) { setLogs([]); indexRef.current = 0; return }
    if (isPaused) return

    const iv = setInterval(() => {
      if (indexRef.current >= DEMO_LOG_MESSAGES.length) indexRef.current = 0
      const template = DEMO_LOG_MESSAGES[indexRef.current]
      setLogs(prev => [...prev.slice(-80), {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date(),
        ...template,
      }])
      indexRef.current++
    }, 800 + Math.random() * 600)

    return () => clearInterval(iv)
  }, [isRunning, isPaused])

  const addLog = (message: string) => {
    setLogs(prev => [...prev, {
      id: `log-${Date.now()}`,
      timestamp: new Date(),
      level: "input",
      message: `> ${message}`,
      node: "user",
    }])
  }

  return { logs, addLog }
}