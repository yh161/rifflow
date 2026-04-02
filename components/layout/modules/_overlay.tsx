"use client"

import React, { useEffect, useId, useRef, useState } from "react"
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
  statusText,
}: {
  cssW:          number
  cssH:          number
  borderRadius?: number
  progress:      number
  statusText?:   string
}) {
  // useId gives a stable, unique ID per component instance so multiple
  // concurrent overlays each get their own SVG <filter> without clashing.
  const uid        = useId()
  const safeUid    = uid.replace(/:/g, '')
  const filterId   = `og-${safeUid}`
  const gradStrokeId  = `og-grad-stroke-${safeUid}`
  const textBgGradId  = `og-grad-text-bg-${safeUid}`
  const renderStatusText = statusText ?? ""
  const statusVisible = Boolean(statusText)
  const [animatedRadius, setAnimatedRadius] = useState(borderRadius)
  const radiusRef = useRef(borderRadius)

  useEffect(() => {
    const from = radiusRef.current
    const to = borderRadius
    if (Math.abs(from - to) < 0.01) return

    const duration = 210
    const start = performance.now()
    let rafId = 0

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (to - from) * eased
      radiusRef.current = next
      setAnimatedRadius(next)
      if (t < 1) rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [borderRadius])

  const r  = Math.max(0, Math.min(animatedRadius, Math.min(cssW, cssH) / 2))
  const w  = cssW
  const h  = cssH
  const hw = h / 2
  const topPath = r <= 0.001
    ? [
      `M 0,${hw}`,
      `L 0,0`,
      `L ${w},0`,
      `L ${w},${hw}`,
    ].join(" ")
    : [
      `M 0,${hw}`,
      `L 0,${r}`,
      `A ${r},${r} 0 0,1 ${r},0`,
      `L ${w - r},0`,
      `A ${r},${r} 0 0,1 ${w},${r}`,
      `L ${w},${hw}`,
    ].join(" ")
  const bottomPath = r <= 0.001
    ? [
      `M 0,${hw}`,
      `L 0,${h}`,
      `L ${w},${h}`,
      `L ${w},${hw}`,
    ].join(" ")
    : [
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
    <>
      <svg
        width={w}
        height={h}
        style={{
          position:      "absolute",
          top:           0,
          left:          0,
          overflow:      "visible",
          pointerEvents: "none",
          zIndex:        130,
        }}
      >
        {/*
          SVG <filter> (not CSS `filter`) avoids triggering Chromium's implicit
          compositor-layer promotion, which would rasterise nodes at zoom=1 and
          produce blur when the ReactFlow viewport is scaled up.
        */}
        <defs>
          <linearGradient id={gradStrokeId} x1="0" y1="0" x2={String(w)} y2={String(h)} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#36e3f7" />
            <stop offset="45%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#5b6cff" />
          </linearGradient>
          <linearGradient id={textBgGradId} x1="0" y1={String(h - 74)} x2="0" y2={String(h)} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.76)" />
            <stop offset="100%" stopColor="rgba(248,250,252,0.96)" />
          </linearGradient>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.9" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Bottom fade bg for status readability */}
        <rect x={0} y={Math.max(0, h - 74)} width={w} height={74} rx={r} ry={r} fill={`url(#${textBgGradId})`} />

        {/* Faint border track */}
        <path d={topPath} fill="none" stroke="rgba(59,130,246,0.15)" strokeWidth={1.5} />
        <path d={bottomPath} fill="none" stroke="rgba(59,130,246,0.15)" strokeWidth={1.5} />

        {/* Glowing progress */}
        <path
          d={topPath}
          fill="none"
          stroke={`url(#${gradStrokeId})`}
          strokeWidth={3.4}
          strokeLinecap="round"
          opacity={0.22}
          strokeDasharray={pathLen}
          strokeDashoffset={offset}
          filter={`url(#${filterId})`}
          style={{ transition: "stroke-dashoffset 90ms linear" }}
        />
        <path
          d={bottomPath}
          fill="none"
          stroke={`url(#${gradStrokeId})`}
          strokeWidth={3.4}
          strokeLinecap="round"
          opacity={0.22}
          strokeDasharray={pathLen}
          strokeDashoffset={offset}
          filter={`url(#${filterId})`}
          style={{ transition: "stroke-dashoffset 90ms linear" }}
        />

        {/* Core stroke */}
        <path
          d={topPath}
          fill="none"
          stroke={`url(#${gradStrokeId})`}
          strokeWidth={1.95}
          strokeLinecap="round"
          strokeDasharray={pathLen}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 90ms linear" }}
        />
        <path
          d={bottomPath}
          fill="none"
          stroke={`url(#${gradStrokeId})`}
          strokeWidth={1.95}
          strokeLinecap="round"
          strokeDasharray={pathLen}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 90ms linear" }}
        />
      </svg>

      {renderStatusText && (
        <div
          style={{
            position:      "absolute",
            left:          0,
            right:         0,
            bottom:        0,
            // Keep status text aligned with overlay layer; do not let a solid bg cover strokes.
            zIndex:        130,
            pointerEvents: "none",
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            gap:           9,
            color:         "rgba(71,85,105,0.92)",
            fontStyle:     "italic",
            fontSize:      11,
            lineHeight:    1.1,
            padding:       "12px 12px 20px",
            borderBottomLeftRadius: r,
            borderBottomRightRadius: r,
            opacity:       statusVisible ? 1 : 0,
            transform:     `translateY(${statusVisible ? -1 : 8}px)`,
            transition:    "opacity 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0.9 }}>
            <circle
              cx="12"
              cy="12"
              r="8"
              fill="none"
              stroke="rgba(148,163,184,0.5)"
              strokeWidth="2.6"
            />
            <path
              d="M12 4a8 8 0 0 1 8 8"
              fill="none"
              stroke="rgba(34,211,238,0.95)"
              strokeWidth="2.6"
              strokeLinecap="round"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 12 12"
                to="360 12 12"
                dur="0.9s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
          <span style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "calc(100% - 42px)",
            lineHeight: 1.2,
            display: "block",
          }}>
            {renderStatusText}
          </span>
        </div>
      )}
    </>
  )
}
