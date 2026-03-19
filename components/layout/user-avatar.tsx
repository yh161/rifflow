"use client"

import React, { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"

interface UserAvatarProps {
  isSidebarOpen: boolean
  isRunning: boolean
}

// ── ♩ 积分符号 ─────────────────────────────────────────────────────────────
export function PtIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-bold select-none leading-none", className)}
      aria-label="积分"
      style={{ fontFamily: "Georgia, serif" }}
    >
      ♩
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function UserAvatar({ isSidebarOpen, isRunning }: UserAvatarProps) {
  const { data: session } = useSession()
  const [credits, setCredits] = useState<number>(0)
  const [hovered, setHovered] = useState(false)

  const leftOffset = isSidebarOpen ? 320 + 16 : 16
  const avatarUrl   = session?.user?.image ?? undefined
  const displayName = session?.user?.name ?? session?.user?.email ?? "User"
  const initials    = displayName.charAt(0).toUpperCase()

  useEffect(() => {
    if (!session?.user) return
    fetch("/api/user/wallet")
      .then((r) => r.json())
      .then((d) => setCredits(d.points ?? 0))
      .catch(() => {})
  }, [session])

  return (
    <div
      className={cn(
        "absolute z-30 top-5 flex flex-col items-center gap-2",
        "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isRunning && "opacity-0 pointer-events-none -translate-y-1",
      )}
      style={{ left: leftOffset }}
    >
      {/* ── Avatar button ── */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("navigate:account"))}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative flex flex-col items-center gap-2 group"
        title={displayName}
      >
        {/* Glow ring */}
        <div className={cn(
          "absolute inset-[-3px] rounded-full transition-all duration-500",
          "bg-gradient-to-br from-slate-300/60 via-white/40 to-slate-400/40",
          hovered && "from-blue-400/50 via-violet-300/40 to-slate-300/50 scale-110",
        )} />

        {/* Avatar circle */}
        <div className={cn(
          "relative w-[52px] h-[52px] rounded-full overflow-hidden",
          "ring-[1.5px] ring-white/80 ring-offset-0",
          "flex items-center justify-center",
          "bg-gradient-to-br from-slate-100 to-slate-200",
          "shadow-md shadow-black/10",
          "transition-all duration-300",
          hovered && "scale-105 shadow-lg shadow-black/15",
        )}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className={cn(
              "text-base font-semibold select-none transition-colors duration-300",
              hovered ? "text-slate-600" : "text-slate-400",
            )}>
              {initials}
            </span>
          )}
        </div>

        {/* ── Credits pill ── */}
        {session?.user && (
          <div className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-full",
            "bg-white/70 backdrop-blur-md",
            "border border-white/60",
            "shadow-sm shadow-black/[0.06]",
            "transition-all duration-300",
            hovered
              ? "bg-white/90 border-blue-200/60 shadow-blue-100/40 shadow-md -translate-y-0.5"
              : "",
          )}>
            <PtIcon className={cn(
              "text-[11px] transition-colors duration-300",
              hovered ? "text-blue-500" : "text-slate-400",
            )} />
            <span className={cn(
              "text-[11px] font-semibold tabular-nums leading-none select-none transition-colors duration-300",
              hovered ? "text-slate-700" : "text-slate-500",
            )}>
              {credits.toLocaleString()}
            </span>
          </div>
        )}
      </button>
    </div>
  )
}
