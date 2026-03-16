"use client"

import React from "react"

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
      {/* Faint track */}
      <path d={topPath}    fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />
      <path d={bottomPath} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />

      {/* Glowing progress */}
      <path
        d={topPath} fill="none" stroke="#4ade80" strokeWidth={3} strokeLinecap="round"
        strokeDasharray={pathLen} strokeDashoffset={offset}
        style={{ filter: "drop-shadow(0 0 4px #4ade80)", transition: "stroke-dashoffset 60ms linear" }}
      />
      <path
        d={bottomPath} fill="none" stroke="#4ade80" strokeWidth={3} strokeLinecap="round"
        strokeDasharray={pathLen} strokeDashoffset={offset}
        style={{ filter: "drop-shadow(0 0 4px #4ade80)", transition: "stroke-dashoffset 60ms linear" }}
      />
    </svg>
  )
}
