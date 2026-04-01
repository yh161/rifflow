"use client"

import React, { useId, useState } from "react"
import { RotateCcw, Copy, Check } from "lucide-react"

/**
 * ErrorOverlay
 *
 * Same SVG border technique as GeneratingOverlay, but at 100% progress
 * and red. Adds a small non-blurred message panel inside the node.
 * No CSS filter / backdropFilter to avoid Chromium rasterization bug.
 */
export function ErrorOverlay({
  message,
  onDismiss,
}: {
  message:   string
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <>
      {/* Error message panel */}
      <div
        style={{
          position:      "absolute",
          bottom:        10,
          left:          10,
          right:         10,
          zIndex:        35,
          pointerEvents: "auto",
          background:    "rgba(255,255,255,0.97)",
          border:        "1px solid rgba(239,68,68,0.25)",
          borderRadius:  8,
          padding:       "6px 8px",
          display:       "flex",
          flexDirection: "column",
          gap:           5,
        }}
      >
        <p style={{
          margin:     0,
          fontSize:   10,
          lineHeight: 1.4,
          color:      "#64748b",
          userSelect: "text",
          wordBreak:  "break-word",
          cursor:     "text",
        }}>
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
          <button
            onClick={handleCopy}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          3,
              padding:      "2px 8px",
              borderRadius: 20,
              border:       "1px solid #e2e8f0",
              background:   "transparent",
              color:        "#94a3b8",
              fontSize:     10,
              fontWeight:   600,
              cursor:       "pointer",
            }}
          >
            {copied ? <Check size={9} /> : <Copy size={9} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss() }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          3,
              padding:      "2px 8px",
              borderRadius: 20,
              border:       "1px solid #e2e8f0",
              background:   "transparent",
              color:        "#94a3b8",
              fontSize:     10,
              fontWeight:   600,
              cursor:       "pointer",
            }}
          >
            <RotateCcw size={9} />
            Dismiss
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * GeneratingOverlay
 *
 * SVG progress bar that crawls along the node border.
 * Rendered inside the node's own React tree (CSS coordinate space).
 *
 * cssW / cssH : node's CSS pixel dimensions (no zoom multiplier needed)
 * borderRadius: node's CSS border-radius in pixels (default 12)
 * progress    : 0–1
 */
export function GeneratingOverlay({
  cssW,
  cssH,
  borderRadius = 12,
  progress,
}: {
  cssW:          number
  cssH:          number
  borderRadius?: number
  progress:      number
}) {
  // useId gives a stable, unique ID per component instance so multiple
  // concurrent overlays each get their own SVG <filter> without clashing.
  const uid      = useId()
  const filterId = `og-${uid.replace(/:/g, '')}`

  const r  = borderRadius
  const w  = cssW
  const h  = cssH
  const hw = h / 2

  const topPath = [
    `M 0,${hw}`,
    `L 0,${r}`,
    `A ${r},${r} 0 0,1 ${r},0`,
    `L ${w - r},0`,
    `A ${r},${r} 0 0,1 ${w},${r}`,
    `L ${w},${hw}`,
  ].join(" ")

  const bottomPath = [
    `M 0,${hw}`,
    `L 0,${h - r}`,
    `A ${r},${r} 0 0,0 ${r},${h}`,
    `L ${w - r},${h}`,
    `A ${r},${r} 0 0,0 ${w},${h - r}`,
    `L ${w},${hw}`,
  ].join(" ")

  const arcLen  = (Math.PI * r) / 2
  const pathLen = (hw - r) + arcLen + (w - 2 * r) + arcLen + (hw - r)
  const offset  = pathLen * (1 - Math.min(progress, 1))

  return (
    <svg
      width={w}
      height={h}
      style={{
        position:      "absolute",
        top:           0,
        left:          0,
        overflow:      "visible",
        pointerEvents: "none",
        zIndex:        10,
      }}
    >
      {/*
        SVG <filter> (not CSS `filter`) avoids triggering Chromium's implicit
        compositor-layer promotion, which would rasterise nodes at zoom=1 and
        produce blur when the ReactFlow viewport is scaled up.
      */}
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Faint track */}
      <path d={topPath}    fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />
      <path d={bottomPath} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />

      {/* Glowing progress — glow via SVG filter*/}
      <path
        d={topPath} fill="none" stroke="#4ade80" strokeWidth={3} strokeLinecap="round"
        strokeDasharray={pathLen} strokeDashoffset={offset}
        filter={`url(#${filterId})`}
        style={{ transition: "stroke-dashoffset 60ms linear" }}
      />
      <path
        d={bottomPath} fill="none" stroke="#4ade80" strokeWidth={3} strokeLinecap="round"
        strokeDasharray={pathLen} strokeDashoffset={offset}
        filter={`url(#${filterId})`}
        style={{ transition: "stroke-dashoffset 60ms linear" }}
      />
    </svg>
  )
}
