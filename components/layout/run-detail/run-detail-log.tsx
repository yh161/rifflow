"use client"

import React, { useRef, useEffect, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { WorkflowMeta, WorkflowTask } from "./run-detail"

// ─────────────────────────────────────────────
// Helpers (shared with header/pill)
// ─────────────────────────────────────────────
const GRADIENTS = [
  ["#667eea", "#764ba2"], ["#f093fb", "#f5576c"], ["#4facfe", "#00f2fe"],
  ["#43e97b", "#38f9d7"], ["#fa709a", "#fee140"], ["#a18cd1", "#fbc2eb"],
]
function coverGradient(name: string) {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % GRADIENTS.length
  return `linear-gradient(135deg, ${GRADIENTS[idx][0]}, ${GRADIENTS[idx][1]})`
}

// ─────────────────────────────────────────────
// Item style — opacity/weight by status only.
// translateY stagger is done via CSS animation
// on an inner div keyed to waveId (see render).
// ─────────────────────────────────────────────
function getItemStyle(task: WorkflowTask): React.CSSProperties {
  const isCurrent = task.status === "running"
  const isDone    = task.status === "done"
  return {
    fontSize:      16,
    fontWeight:    isCurrent ? 700 : 400,
    opacity:       isCurrent ? 1 : isDone ? 0.45 : 0.2,
    color:         "#0f172a",
    paddingTop:    10,
    paddingBottom: 10,
    lineHeight:    1.3,
    transition:    "opacity 0.4s ease, font-weight 0.3s ease",
  }
}

// ─────────────────────────────────────────────
// Container height is fixed at 650px (from toolbar.tsx).
// Pill occupies bottom-4 (16px) with height ~60px.
// Closed top = 650 - 16 - 60 = 574.
// ─────────────────────────────────────────────
const CONTAINER_H = 650
const PILL_H      = 60
const PILL_BOTTOM = 16
const PILL_SIDE   = 12
const CLOSED_TOP  = CONTAINER_H - PILL_BOTTOM - PILL_H

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface RunDetailLogProps {
  isOpen: boolean
  meta: WorkflowMeta
  tasks: WorkflowTask[]
  elapsedTime: number
  onOpen: () => void
  onClose: () => void
}

// ─────────────────────────────────────────────
// Component — single div that morphs pill ↔ full screen
// ─────────────────────────────────────────────
export function RunDetailLog({
  isOpen, meta, tasks, elapsedTime, onOpen, onClose,
}: RunDetailLogProps) {
  // ── Scroll logic ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs  = useRef<(HTMLDivElement | null)[]>([])

  const activeIdx  = tasks.findIndex(t => t.status === "running")
  const doneCount  = tasks.filter(t => t.status === "done").length
  const focusIdx   = activeIdx >= 0 ? activeIdx : Math.max(doneCount - 1, 0)

  // waveId increments each time focus advances — used to re-key
  // animation wrappers below focusIdx, forcing cascade-up to replay.
  const [waveId, setWaveId] = useState(0)
  const prevFocusRef = useRef(-1)
  useEffect(() => {
    if (focusIdx > prevFocusRef.current) {
      prevFocusRef.current = focusIdx
      setWaveId(id => id + 1)
    }
  }, [focusIdx])

  useEffect(() => {
    if (!isOpen) return
    const container = scrollRef.current
    const item      = itemRefs.current[focusIdx]
    if (!container || !item) return
    const target = item.offsetTop - container.clientHeight * 0.35
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" })
  }, [focusIdx, isOpen])

  // ── Pill progress / fill ──
  const done       = tasks.filter(t => t.status === "done").length
  const total      = tasks.length
  const pct        = total === 0 ? 0 : (done / total) * 100
  const isComplete = total > 0 && done === total
  const hasError   = tasks.some(t => t.status === "error")
  const isRunning  = tasks.some(t => t.status === "running")
  const current    = tasks.find(t => t.status === "running")

  const fillColor = hasError    ? "rgba(239,68,68,0.18)"
    : isComplete                ? "rgba(52,211,153,0.18)"
    :                             "rgba(96,165,250,0.15)"

  // ── Cycling pill text ──
  const [showTask, setShowTask] = useState(false)
  useEffect(() => {
    if (!isRunning || !current) { setShowTask(false); return }
    const iv = setInterval(() => setShowTask(v => !v), 3000)
    return () => clearInterval(iv)
  }, [isRunning, !!current])

  // ── Morph geometry ──
  const morph: React.CSSProperties = {
    position:     "absolute",
    top:          isOpen ? 0 : CLOSED_TOP,
    left:         isOpen ? 0 : PILL_SIDE,
    right:        isOpen ? 0 : PILL_SIDE,
    bottom:       isOpen ? 0 : PILL_BOTTOM,
    borderRadius: isOpen ? 32 : 22,
    overflow:     "hidden",
    zIndex:       20,
    // background morphs glass → white
    background:          isOpen ? "white" : "rgba(255,255,255,0.55)",
    backdropFilter:       isOpen ? "none"  : "blur(24px)",
    WebkitBackdropFilter: isOpen ? "none"  : "blur(24px)",
    border:  isOpen
      ? "1px solid rgba(226,232,240,0.5)"
      : "1px solid rgba(255,255,255,0.75)",
    boxShadow: isOpen
      ? "0 2px 20px rgba(0,0,0,0.08)"
      : "0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.9)",
    transition: [
      "top    0.52s cubic-bezier(0.16,1,0.3,1)",
      "left   0.52s cubic-bezier(0.16,1,0.3,1)",
      "right  0.52s cubic-bezier(0.16,1,0.3,1)",
      "bottom 0.52s cubic-bezier(0.16,1,0.3,1)",
      "border-radius 0.52s cubic-bezier(0.16,1,0.3,1)",
      "background 0.4s ease",
      "box-shadow 0.4s ease",
    ].join(", "),
  }

  return (
    <div style={morph}>

      {/* ════════════════════════════════
          PILL STATE
          ════════════════════════════════ */}
      {/* Liquid fill */}
      <div
        style={{
          position:            "absolute",
          top: 0, bottom: 0, left: 0,
          width:               `${pct}%`,
          background:          fillColor,
          backdropFilter:      "blur(8px)",
          WebkitBackdropFilter:"blur(8px)",
          opacity:             isOpen ? 0 : 1,
          transition:          "width 1s ease-out, opacity 0.18s ease",
        }}
      />

      {/* Pill content */}
      <div
        onClick={() => !isOpen && onOpen()}
        style={{
          position:      "absolute",
          inset:         0,
          display:       "flex",
          alignItems:    "center",
          gap:           12,
          padding:       "10px 12px",
          opacity:       isOpen ? 0 : 1,
          pointerEvents: isOpen ? "none" : "auto",
          transition:    "opacity 0.18s ease",
          cursor:        "pointer",
        }}
      >
        {/* Cover thumb */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: meta.coverImage ? undefined : coverGradient(meta.name),
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        }}>
          {meta.coverImage
            ? <img src={meta.coverImage} alt={meta.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700, fontSize: 18, userSelect: "none" }}>
                {meta.name.charAt(0).toUpperCase()}
              </span>
          }
        </div>

        {/* Cycling text */}
        <div style={{ flex: 1, minWidth: 0, position: "relative", height: 36 }}>
          {/* Workflow meta */}
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center",
            opacity: showTask && !!current ? 0 : 1, transition: "opacity 0.5s ease",
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
              {meta.name}
            </p>
            <p style={{ fontSize: 11, color: "#64748b", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
              {meta.author}
            </p>
          </div>
          {/* Current task */}
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center",
            opacity: showTask && !!current ? 1 : 0, transition: "opacity 0.5s ease",
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
              {current?.label}
            </p>
            <p style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
              {current?.nodeId}
            </p>
          </div>
        </div>

        <ChevronUp size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
      </div>

      {/* ════════════════════════════════
          LOG STATE
          ════════════════════════════════ */}
      <div
        style={{
          position:      "absolute",
          inset:         0,
          display:       "flex",
          flexDirection: "column",
          opacity:       isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          // delay fade-in until morph is mostly done
          transition:    isOpen ? "opacity 0.25s ease 0.28s" : "opacity 0.15s ease",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 8px", flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#94a3b8" }}
            className="hover:bg-slate-100 hover:text-slate-700 transition-all"
          >
            <ChevronDown size={18} strokeWidth={2} />
          </button>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#334155", margin: 0, lineHeight: 1.3 }}>{meta.name}</p>
            <p style={{ fontSize: 10, color: "#94a3b8", margin: "2px 0 0", fontFamily: "monospace" }}>{meta.author}</p>
          </div>
          <div style={{ width: 32 }} />
        </div>

        {/* Task list */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0,
            padding: "0 28px",
            scrollbarWidth: "none",
          } as React.CSSProperties}
        >
          <div style={{ height: "35%" }} />
          {tasks.map((task, i) => {
            const isCurrent = i === activeIdx && task.status === "running"
            const isBelow   = i > focusIdx
            const stagger   = isBelow ? (i - focusIdx - 1) * 50 : 0
            return (
              <div
                key={task.id}
                ref={el => { itemRefs.current[i] = el }}
                style={getItemStyle(task)}
              >
                {/* Inner wrapper re-keyed on waveId to retrigger cascade-up animation */}
                <span
                  key={isBelow ? `w${waveId}-${i}` : `s-${i}`}
                  style={isBelow ? {
                    display:        "inline",
                    animation:      `cascade-up 0.45s cubic-bezier(0.16,1,0.3,1) ${stagger}ms both`,
                  } : undefined}
                >
                  {task.label}
                </span>
                {isCurrent && (
                  <span className="animate-pulse" style={{ marginLeft: 8, color: "#60a5fa", fontSize: 12 }}>···</span>
                )}
                {task.status === "done" && task.duration !== undefined && (
                  <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 8, fontWeight: 400 }}>
                    {task.duration < 1000 ? `${task.duration}ms` : `${(task.duration / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            )
          })}
          <div style={{ height: "65%" }} />
        </div>
      </div>

    </div>
  )
}
