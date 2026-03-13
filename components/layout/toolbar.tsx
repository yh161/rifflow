"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { MessageSquare, Play, Pause, Square } from "lucide-react"

import { MODULES } from "@/components/layout/modules/_registry"
import { NodePickerMenu } from "@/components/layout/node_picker"
import RunConsole, { type LogEntry } from "@/components/layout/run-console"

// ─────────────────────────────────────────────
// Clean plus icon — single path, no intersection seam
// ─────────────────────────────────────────────
function PlusIcon({ size = 20, strokeWidth = 2, className, style }: {
  size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties
}) {
  const r = strokeWidth / 2
  const s = size
  const c = s / 2
  // A single closed shape: a plus drawn as one continuous path
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" className={className} style={style}>
      <path
        d={`M${c - r} ${r + 2} L${c - r} ${c - r} L${r + 2} ${c - r} L${r + 2} ${c + r} L${c - r} ${c + r} L${c - r} ${s - r - 2} L${c + r} ${s - r - 2} L${c + r} ${c + r} L${s - r - 2} ${c + r} L${s - r - 2} ${c - r} L${c + r} ${c - r} L${c + r} ${r + 2} Z`}
        fill="currentColor"
        shapeRendering="geometricPrecision"
      />
    </svg>
  )
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const LONG_PRESS_MS = 1500

// ─────────────────────────────────────────────
// Circular progress ring (long-press to stop)
// ─────────────────────────────────────────────
const RING_R = 24
const RING_C = 2 * Math.PI * RING_R

function LongPressRing({ progress }: { progress: number }) {
  if (progress <= 0) return null
  return (
    <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 56 56">
      <circle cx={28} cy={28} r={RING_R} fill="none" stroke="rgba(239,68,68,0.15)" strokeWidth={3} />
      <circle
        cx={28} cy={28} r={RING_R}
        fill="none" stroke="#ef4444" strokeWidth={3} strokeLinecap="round"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - progress)}
      />
    </svg>
  )
}

// ─────────────────────────────────────────────
// Run / Pause / Stop control button
// ─────────────────────────────────────────────
interface RunControlProps {
  isRunning: boolean
  isPaused: boolean
  onRun: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  isMorphed: boolean
}

function RunControl({ isRunning, isPaused, onRun, onPause, onResume, onStop, isMorphed }: RunControlProps) {
  const [longPressProgress, setLongPressProgress] = useState(0)
  const pressStartRef = useRef(0)
  const rafRef = useRef<number>(0)
  const didLongPress = useRef(false)

  const cancelLongPress = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setLongPressProgress(0)
    pressStartRef.current = 0
  }, [])

  const tick = useCallback(() => {
    const elapsed = Date.now() - pressStartRef.current
    const p = Math.min(elapsed / LONG_PRESS_MS, 1)
    setLongPressProgress(p)
    if (p >= 1) {
      didLongPress.current = true
      onStop()
      cancelLongPress()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [onStop, cancelLongPress])

  const handlePointerDown = useCallback(() => {
    if (!isRunning) return
    didLongPress.current = false
    pressStartRef.current = Date.now()
    rafRef.current = requestAnimationFrame(tick)
  }, [isRunning, tick])

  const handlePointerUp = useCallback(() => {
    if (!isRunning) return
    const elapsed = Date.now() - pressStartRef.current
    cancelLongPress()
    if (didLongPress.current) return
    if (elapsed < 250) {
      isPaused ? onResume() : onPause()
    }
  }, [isRunning, isPaused, onPause, onResume, cancelLongPress])

  useEffect(() => {
    if (!isRunning) cancelLongPress()
  }, [isRunning, cancelLongPress])

  // Idle — green play
  if (!isRunning) {
    return (
      <button
        onClick={onRun}
        title="Run workflow"
        className={cn(
          "relative w-[48px] h-[48px] rounded-full flex items-center justify-center",
          "bg-white text-emerald-500",
          "border border-emerald-100 shadow-lg shadow-emerald-100/50",
          "hover:scale-110 hover:shadow-xl hover:shadow-emerald-200/50",
          "active:scale-95",
          "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        )}
      >
        <Play size={18} strokeWidth={2.5} className="translate-x-[1px]" />
      </button>
    )
  }

  // Running — pause / resume + long-press stop ring
  return (
    <div
      className="relative w-[56px] h-[56px] select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelLongPress}
      onContextMenu={(e) => e.preventDefault()}
    >
      <LongPressRing progress={longPressProgress} />

      <button
        className={cn(
          "absolute inset-[3px] rounded-full flex items-center justify-center",
          "transition-all duration-300",
          longPressProgress > 0
            ? "bg-red-50 text-red-500 scale-90 border border-red-200"
            : isPaused
              ? "bg-white text-amber-500 border border-amber-200 shadow-lg shadow-amber-100/50"
              : "bg-white text-slate-600 border border-slate-200 shadow-lg shadow-slate-200/50",
        )}
      >
        {longPressProgress > 0.5 ? (
          <Square size={14} strokeWidth={2.5} className="text-red-500" />
        ) : isPaused ? (
          <Play size={16} strokeWidth={2.5} className="translate-x-[1px]" />
        ) : (
          <Pause size={16} strokeWidth={2.5} />
        )}
      </button>

      {/* "Hold to stop" hint */}
      {longPressProgress > 0 && longPressProgress < 1 && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-medium text-red-400 whitespace-nowrap animate-in fade-in duration-150">
          Hold to stop
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Toolbar
// ─────────────────────────────────────────────
interface ToolbarProps {
  onSelectTool: (id: string) => void
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  // Run state
  isRunning: boolean
  isPaused: boolean
  onRun: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  // Console
  logs: LogEntry[]
  onSendInput?: (text: string) => void
  // Favorites — quick-launch shortcuts
  favorites: string[]
  onToggleFavorite: (typeId: string) => void
}

export default function Toolbar({
  onSelectTool,
  isSidebarOpen,
  onToggleSidebar,
  isRunning,
  isPaused,
  onRun,
  onPause,
  onResume,
  onStop,
  logs,
  onSendInput,
  favorites,
  onToggleFavorite,
}: ToolbarProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const plusBtnRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const toolbarContentRef = useRef<HTMLDivElement>(null)
  const [toolbarNaturalHeight, setToolbarNaturalHeight] = useState(0)

  useEffect(() => {
    if (!toolbarContentRef.current) return
    const measure = () => {
      if (toolbarContentRef.current)
        setToolbarNaturalHeight(toolbarContentRef.current.offsetHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(toolbarContentRef.current)
    return () => ro.disconnect()
  }, [])

  const clearClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }
  const scheduleClose = () => {
    clearClose()
    closeTimer.current = setTimeout(() => setIsPickerOpen(false), 120)
  }

  // Position is computed once when picker opens and stored in state,
  // so the very first paint already has correct coords (no jump).
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number } | null>(null)

  const openPicker = () => {
    if (plusBtnRef.current && rootRef.current) {
      const btnRect  = plusBtnRef.current.getBoundingClientRect()
      const rootRect = rootRef.current.getBoundingClientRect()
      setPickerPos({
        left: btnRect.right - rootRect.left + 12,
        top:  btnRect.top   - rootRect.top  + btnRect.height / 2,
      })
    }
    setIsPickerOpen(true)
  }

  return (
    <div ref={rootRef} className="relative flex flex-col items-center">
      {/* ═══════════════════════════════════════
          MORPHING CONTAINER
          Idle    → narrow pill (toolbar)
          Running → phone-shaped console
          ═══════════════════════════════════════ */}
      <div
        className={cn(
          "relative overflow-hidden",
          "transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isRunning
            ? [
                "rounded-[32px]",
                "bg-white border border-slate-200/80",
                "shadow-2xl shadow-black/10",
              ]
            : [
                "rounded-[22px]",
                "bg-white/80 border border-slate-200/60 backdrop-blur-xl",
                "shadow-lg shadow-black/[0.06]",
              ],
        )}
        style={{
          width:  isRunning ? 300 : undefined,
          height: isRunning ? 650 : (toolbarNaturalHeight || undefined),
        }}
      >
        {/* ── Normal toolbar content ── */}
        <div
          ref={toolbarContentRef}
          className={cn(
            "flex flex-col items-center gap-1 p-1.5",
            "transition-all duration-100",
            isRunning
              ? "opacity-0 scale-75 pointer-events-none"
              : "opacity-100 scale-100 delay-500",
          )}
        >
          {/* + node picker */}
          <div className="relative">
            <button
              ref={plusBtnRef}
              onClick={() => isPickerOpen ? setIsPickerOpen(false) : openPicker()}
              onMouseLeave={scheduleClose}
              onMouseEnter={clearClose}
              className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300",
                isPickerOpen
                  ? "bg-slate-100 text-slate-700"
                  : "bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100",
              )}
            >
            <PlusIcon
              size={18}
              strokeWidth={2}
              className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{ transform: isPickerOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
            />
          </button>
          </div>

          {favorites.length > 0 && <div className="w-5 h-px bg-slate-200 my-0.5" />}

          {/* Favorites quick-launch — pinned nodes appear here */}
          {favorites.map((typeId) => {
            const modById = Object.fromEntries(MODULES.map((m) => [m.meta.id, m]))
            const mod = modById[typeId]
            if (!mod) return null
            const Icon = mod.meta.icon
            return (
              <button
                key={typeId}
                onClick={() => { onSelectTool(typeId); setIsPickerOpen(false) }}
                title={mod.meta.name}
                className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200",
                  "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
                )}
              >
                <Icon size={16} strokeWidth={1.8} />
              </button>
            )
          })}

          <div className="w-5 h-px bg-slate-200 my-0.5" />

          {/* Sidebar toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSidebar() }}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300",
              isSidebarOpen
                ? "bg-blue-500 text-white shadow-md shadow-blue-200 scale-105"
                : "bg-blue-500/80 text-white/90 hover:bg-blue-500 hover:shadow-md hover:shadow-blue-200",
            )}
          >
            <MessageSquare size={15} strokeWidth={2} />
          </button>
        </div>

        {/* ── Phone console content ── */}
        <div
          className={cn(
            "absolute inset-0",
            "transition-all duration-500",
            isRunning
              ? "opacity-100 scale-100 delay-300"
              : "opacity-0 scale-90 pointer-events-none",
          )}
        >
          <RunConsole
            isVisible={isRunning}
            isPaused={isPaused}
            logs={logs}
            onSendInput={onSendInput}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════
          NODE PICKER — shared NodePickerMenu
          ═══════════════════════════════════════ */}
      {isPickerOpen && !isRunning && pickerPos && (
        <div
          onMouseEnter={clearClose}
          onMouseLeave={scheduleClose}
        >
          <NodePickerMenu
            closeMode="hover"
            onSelect={(id) => { onSelectTool(id); setIsPickerOpen(false) }}
            onDismiss={() => setIsPickerOpen(false)}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            left={pickerPos.left}
            top={pickerPos.top}
            transform="translateY(-50%)"
            showArrow
          />
        </div>
      )}

      {/* ═══════════════════════════════════════
          RUN CONTROL BUTTON
          ═══════════════════════════════════════ */}
      <div className={cn(
        "flex flex-col items-center transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isRunning ? "mt-4 self-start" : "mt-3",
      )}>
        <RunControl
          isRunning={isRunning}
          isPaused={isPaused}
          onRun={onRun}
          onPause={onPause}
          onResume={onResume}
          onStop={onStop}
          isMorphed={isRunning}
        />
      </div>
    </div>
  )
}