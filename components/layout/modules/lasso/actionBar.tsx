"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { Play, Pause, Square, Ungroup, Trash2, ChevronLeft } from "lucide-react"
import { HexColorPicker } from "react-colorful"
import { ActionButton } from "../../node_editor/_action_bar"
import type { ActionBarProps } from "../_action_bar_types"

const ease = "cubic-bezier(0.4, 0, 0.2, 1)"

// ─────────────────────────────────────────────
// Preset color swatches for lasso background
// ─────────────────────────────────────────────
const PRESET_COLORS: { label: string; value: string | null }[] = [
  { label: "Clear",   value: null       },
  { label: "Red",     value: "#ef4444"  },
  { label: "Orange",  value: "#f97316"  },
  { label: "Yellow",  value: "#eab308"  },
  { label: "Green",   value: "#22c55e"  },
  { label: "Teal",    value: "#14b8a6"  },
  { label: "Blue",    value: "#3b82f6"  },
  { label: "Indigo",  value: "#6366f1"  },
  { label: "Purple",  value: "#8b5cf6"  },
  { label: "Pink",    value: "#ec4899"  },
]

// ─────────────────────────────────────────────
// Swatch — shared swatch style for both closed/open states
// ─────────────────────────────────────────────
const Swatch = React.forwardRef<
  HTMLButtonElement,
  {
    color: string | null
    isActive?: boolean
    onClick: () => void
    title: string
    size?: number
    isRainbow?: boolean
  }
>(function Swatch({ color, isActive, onClick, title, size = 18, isRainbow = false }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      title={title}
      className="rounded-full flex-shrink-0 transition-all duration-150 hover:scale-110 focus:outline-none"
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        backgroundColor: !isRainbow ? (color ?? "transparent") : undefined,
        border: color
          ? `2px solid ${isActive ? color : "transparent"}`
          : "2px dashed #cbd5e1",
        boxShadow: isActive
          ? `0 0 0 1.5px white, 0 0 0 3px ${color ?? "#94a3b8"}`
          : "none",
        padding: 0,
        position: "relative",
      }}
    >
      {isRainbow && (
        <div
          style={{
            width: "100%",
            height: "100%",
            background:
              "conic-gradient(#ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
          }}
        />
      )}
    </button>
  )
})

// ─────────────────────────────────────────────
// ColorPickerPortal — renders outside overflow containers
// ─────────────────────────────────────────────
function ColorPickerPortal({
  anchorRef,
  color,
  onChange,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  color: string
  onChange: (c: string) => void
  onClose: () => void
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Calculate position from anchor
  useEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({
      top: rect.top - 8,   // will use transform to shift up
      left: rect.left + rect.width / 2,
    })
  }, [anchorRef])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [anchorRef, onClose])

  if (!pos || typeof document === "undefined") return null

  return createPortal(
    <div
      ref={popoverRef}
      className="rounded-xl shadow-2xl border border-slate-200 bg-white p-3"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: "translate(-50%, -100%)",
        zIndex: 99999,
        marginTop: -8,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <HexColorPicker color={color} onChange={onChange} />
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wide">
          {color}
        </span>
        <button
          onClick={onClose}
          className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-0.5 rounded hover:bg-slate-100 transition-colors"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  )
}

// ─────────────────────────────────────────────
// ColorSection — palette button + expanded panel
// ─────────────────────────────────────────────
function ColorSection({
  currentColor,
  onColorChange,
}: {
  currentColor: string | null
  onColorChange: (color: string | null) => void
}) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerColor, setPickerColor] = useState(currentColor ?? "#6366f1")
  const pickerAnchorRef = useRef<HTMLButtonElement>(null)

  const handlePreset = (color: string | null) => {
    onColorChange(color)
    if (color) setPickerColor(color)
  }

  const handlePickerChange = (color: string) => {
    setPickerColor(color)
    onColorChange(color)
  }

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setPickerOpen(false)
  }, [])

  return (
    <>
      {/* ── Closed state: single swatch showing current color ── */}
      <div
        className="flex items-center overflow-hidden"
        style={{
          maxWidth:      panelOpen ? "0px"  : "60px",
          opacity:       panelOpen ? 0      : 1,
          pointerEvents: panelOpen ? "none" : "auto",
          transition:    `max-width 280ms ${ease}, opacity 180ms ${ease}`,
        }}
      >
        <div className="px-1.5 py-1">
          <Swatch
            color={currentColor}
            isActive={false}
            onClick={() => setPanelOpen(true)}
            title="Set background color"
            size={16}
          />
        </div>
      </div>

      {/* ── Open state: full color panel ── */}
      <div
        className="flex items-center overflow-hidden"
        style={{
          maxWidth:      panelOpen ? "360px" : "0px",
          opacity:       panelOpen ? 1       : 0,
          pointerEvents: panelOpen ? "auto"  : "none",
          transition:    `max-width 280ms ${ease}, opacity 180ms ${ease}`,
        }}
      >
        {/* Back */}
        <button
          onClick={closePanel}
          title="Close"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mr-0.5"
        >
          <ChevronLeft size={12} />
        </button>

        {/* Presets */}
        {PRESET_COLORS.map((c) => (
          <div key={c.value ?? "clear"} className="px-[3px]">
            <Swatch
              color={c.value}
              isActive={currentColor === c.value}
              onClick={() => handlePreset(c.value)}
              title={c.label}
              size={16}
            />
          </div>
        ))}

        <div className="w-px h-4 bg-slate-200 mx-1 flex-shrink-0" />

        {/* Rainbow / custom color */}
        <div className="px-[3px]">
          <Swatch
            ref={pickerAnchorRef}
            color={null}
            isActive={false}
            onClick={() => setPickerOpen((p) => !p)}
            title="Custom color"
            size={16}
            isRainbow
          />
        </div>
      </div>

      {/* Color picker rendered via portal — escapes overflow:hidden parents */}
      {pickerOpen && (
        <ColorPickerPortal
          anchorRef={pickerAnchorRef}
          color={pickerColor}
          onChange={handlePickerChange}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────
// ActionBarContent — lasso action bar
// ─────────────────────────────────────────────
export function ActionBarContent({
  data,
  workflowStatus = "idle",
  onExecute,
  onLassoPause,
  onLassoResume,
  onLassoStop,
  onLassoRelease,
  onLassoDelete,
  onLassoBgColorChange,
}: ActionBarProps) {
  const currentColor = (data.lassoBgColor as string | undefined) ?? null

  const colorSection = (
    <>
      <ColorSection
        currentColor={currentColor}
        onColorChange={(c) => onLassoBgColorChange?.(c)}
      />
      {/* Divider after color section */}
      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
    </>
  )

  if (workflowStatus === "running") {
    return (
      <>
        {colorSection}
        <ActionButton icon={Pause} label="Pause" onClick={onLassoPause} />
        <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
        <ActionButton icon={Square} label="Stop"  onClick={onLassoStop} danger />
      </>
    )
  }

  if (workflowStatus === "paused") {
    return (
      <>
        {colorSection}
        <ActionButton icon={Play}   label="Resume" onClick={onLassoResume} />
        <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
        <ActionButton icon={Square} label="Stop"   onClick={onLassoStop} danger />
      </>
    )
  }

  // idle
  return (
    <>
      {colorSection}
      <ActionButton icon={Play}    label="Execute" onClick={onExecute} />
      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
      <ActionButton icon={Ungroup} label="Release" onClick={onLassoRelease} />
      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
      <ActionButton icon={Trash2}  label="Delete"  onClick={onLassoDelete} danger />
    </>
  )
}
