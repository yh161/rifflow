"use client"

import { useEffect, useState } from "react"
import Image from "next/image"

export default function LoadingOverlay() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    document.title = "Rifflow | You compose. AI plays."
  }, [])

  useEffect(() => {
    const MIN_MS = 4000

    const start = Date.now()

    const tryHide = () => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, MIN_MS - elapsed)
      setTimeout(() => {
        setFading(true)
        setTimeout(() => setVisible(false), 500)
      }, remaining)
    }

    if (document.readyState === "complete") {
      tryHide()
    } else {
      window.addEventListener("load", tryHide, { once: true })
    }

    return () => window.removeEventListener("load", tryHide)
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.5s ease",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "all",
      }}
    >
      <Image
        src="/loading.gif"
        alt="Loading"
        width={160}
        height={160}
        unoptimized
        priority
      />
    </div>
  )
}
