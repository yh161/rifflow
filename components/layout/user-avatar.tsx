"use client"

import React, { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Key } from "lucide-react"

interface UserAvatarProps {
  isSidebarOpen: boolean
  isRunning: boolean
}

export default function UserAvatar({ isSidebarOpen, isRunning }: UserAvatarProps) {
  const { data: session } = useSession()
  const [credits, setCredits] = useState<number>(0)

  const leftOffset = isSidebarOpen ? 320 + 16 : 16
  const avatarUrl   = session?.user?.image ?? undefined
  const displayName = session?.user?.name ?? session?.user?.email ?? "User"

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
        "absolute z-30 top-5 flex flex-col items-center gap-1.5",
        "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isRunning && "opacity-0 pointer-events-none translate-y-[-4px]",
      )}
      style={{ left: leftOffset }}
    >
      {/* ── Avatar ── */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("navigate:account"))}
        className={cn(
          "w-[52px] h-[52px] rounded-full overflow-hidden shrink-0",
          "ring-1 ring-white/70 ring-offset-0",
          "flex items-center justify-center bg-slate-100",
          "hover:scale-105 hover:ring-white transition-all duration-200",
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-medium text-slate-400 select-none">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {/* ── Credits ── */}
      {session?.user && (
        <div className="flex items-center gap-1">
          <Key size={10} strokeWidth={2.2} className="text-slate-400 shrink-0" />
          <span className="text-[11px] font-medium tabular-nums text-slate-400 select-none">
            {credits.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}