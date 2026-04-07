"use client"

import React, { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"

interface UserAvatarProps {
  isSidebarOpen: boolean
  sidebarWidth?: number
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
export default function UserAvatar({ isSidebarOpen, sidebarWidth = 320, isRunning }: UserAvatarProps) {
  const { data: session } = useSession()
  const [displayCredits, setDisplayCredits] = useState<number>(0)
  const [hovered,     setHovered]     = useState(false)
  const [dbImage,     setDbImage]     = useState<string | null>(null)
  const [dbName,      setDbName]      = useState<string | null>(null)

  const leftOffset  = isSidebarOpen ? sidebarWidth + 16 : 16
  const avatarUrl   = dbImage   ?? session?.user?.image   ?? undefined
  const displayName = dbName    ?? session?.user?.name    ?? session?.user?.email ?? "User"
  const initials    = displayName.charAt(0).toUpperCase()

  // Smooth points animation state (continuous countdown on deduction)
  const creditsRef = React.useRef<number>(0)
  const targetCreditsRef = React.useRef<number>(0)
  const animTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const clearCreditAnim = React.useCallback(() => {
    if (animTimerRef.current) {
      clearInterval(animTimerRef.current)
      animTimerRef.current = null
    }
  }, [])

  const setCreditTarget = React.useCallback((next: number) => {
    const safeNext = Math.max(0, Math.floor(next))
    targetCreditsRef.current = safeNext

    // First sync (initial load)
    if (creditsRef.current === 0 && displayCredits === 0 && safeNext > 0) {
      creditsRef.current = safeNext
      setDisplayCredits(safeNext)
      return
    }

    // Increase/buy/refund: snap directly (requirement focuses on deduction animation)
    if (safeNext >= creditsRef.current) {
      clearCreditAnim()
      creditsRef.current = safeNext
      setDisplayCredits(safeNext)
      return
    }

    // Deduction: 100 -> 99 -> 98 -> ... -> target
    clearCreditAnim()
    animTimerRef.current = setInterval(() => {
      const target = targetCreditsRef.current
      const current = creditsRef.current

      if (current <= target) {
        clearCreditAnim()
        return
      }

      const nextValue = current - 1
      creditsRef.current = nextValue
      setDisplayCredits(nextValue)

      if (nextValue <= target) {
        clearCreditAnim()
      }
    }, 45)
  }, [clearCreditAnim, displayCredits])

  const refreshUser = React.useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const r = await fetch("/api/user/me", { cache: "no-store" })
      const data = r.ok ? await r.json() : null
      if (data?.user) {
        setDbImage(data.user.image ?? null)
        setDbName(data.user.name ?? null)
        setCreditTarget(data.user.points ?? 0)
      }
    } catch {
      // ignore transient errors
    }
  }, [session?.user?.id, setCreditTarget])

  // Keep points in sync without needing page refresh.
  // Any deduction in backend will be picked up and animated continuously.
  useEffect(() => {
    if (!session?.user?.id) return

    const t = setTimeout(() => { void refreshUser() }, 0)
    const id = setInterval(() => { void refreshUser() }, 2500)
    const onFocus = () => { void refreshUser() }
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshUser()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("user:credits:refresh", onFocus as EventListener)

    return () => {
      clearTimeout(t)
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("user:credits:refresh", onFocus as EventListener)
    }
  }, [session?.user?.id, refreshUser])

  // Listen for profile updates from AccountPage
  useEffect(() => {
    const handler = (e: CustomEvent<{ name?: string | null; image?: string | null }>) => {
      if (e.detail?.image !== undefined) setDbImage(e.detail.image ?? null)
      if (e.detail?.name  !== undefined) setDbName(e.detail.name   ?? null)
    }
    window.addEventListener("user:profile:updated", handler as EventListener)
    return () => window.removeEventListener("user:profile:updated", handler as EventListener)
  }, [])

  useEffect(() => {
    return () => clearCreditAnim()
  }, [clearCreditAnim])

  return (
    <div
      className={cn(
        "absolute z-30 top-5 w-[50px]",
        "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isRunning && "opacity-0 pointer-events-none -translate-y-1",
      )}
      style={{ left: leftOffset }}
    >
      {/* ── Avatar button — everything scales together ── */}
      <button
        onClick={() => {
          const userId = session?.user?.id
          if (userId) {
            window.dispatchEvent(new CustomEvent("navigate:account", { detail: { userId } }))
          } else {
            window.dispatchEvent(new CustomEvent("navigate:account"))
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "relative flex flex-col items-center outline-none",
          "transition-transform duration-200",
          hovered ? "scale-105" : "scale-100",
          "active:scale-95 active:duration-75",
        )}
        title={displayName}
      >
        {/* Glow + avatar as one unit */}
        <div className="relative">
            {/* Avatar circle — no border, just shadow */}
          <div className={cn(
            "w-[50px] h-[50px] rounded-full overflow-hidden",
            "flex items-center justify-center",
            "bg-gradient-to-br from-slate-100 to-slate-200",
            "transition-all duration-300",
            hovered
              ? "shadow-[0_6px_24px_rgba(99,102,241,0.35),0_2px_8px_rgba(0,0,0,0.12)]"
              : "shadow-[0_2px_10px_rgba(0,0,0,0.12)]",
          )}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span className={cn(
                "text-base font-semibold select-none transition-colors duration-300",
                hovered ? "text-slate-600" : "text-slate-400",
              )}>
                {initials}
              </span>
            )}
          </div>
        </div>

        {/* Credits pill — absolutely centered below avatar, won't shift avatar position */}
        {session?.user && (
          <div className={cn(
            "absolute top-[54px] left-1/2 -translate-x-1/2 whitespace-nowrap",
            "flex items-center gap-1 px-2.5 py-1 rounded-full",
            "bg-white/70 backdrop-blur-md",
            "border border-white/60",
            "shadow-sm shadow-black/[0.06]",
            "transition-all duration-300",
            hovered && "bg-white/95 border-blue-200/70 shadow-blue-100/60 shadow-md",
          )}>
            <PtIcon className={cn(
              "text-[11px] transition-colors duration-300",
              hovered ? "text-blue-500" : "text-slate-400",
            )} />
            <span className={cn(
              "text-[11px] font-semibold tabular-nums leading-none select-none transition-colors duration-300",
              hovered ? "text-slate-700" : "text-slate-500",
            )}>
              {displayCredits >= 999500 ? "999k+" : displayCredits >= 1000 ? `${Math.round(displayCredits / 100) / 10}k` : displayCredits.toString()}
            </span>
          </div>
        )}
      </button>
    </div>
  )
}
