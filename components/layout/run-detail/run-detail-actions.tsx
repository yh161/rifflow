"use client"

import React from "react"
import { Play, Pause, Shuffle, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface RunDetailActionsProps {
  isRunning: boolean
  isPaused: boolean
  onRun: () => void
  onPause: () => void
  onResume: () => void
}

export function RunDetailActions({ isRunning, isPaused, onRun, onPause, onResume }: RunDetailActionsProps) {
  const handlePlayPause = () => {
    if (!isRunning) onRun()
    else if (isPaused) onResume()
    else onPause()
  }

  return (
    <div className="flex items-center justify-between px-5 py-3">
      {/* TODO: assign functionality */}
      <button className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full transition-colors">
        <Shuffle size={17} strokeWidth={1.8} />
      </button>

      <button
        onClick={handlePlayPause}
        className={cn(
          "flex items-center gap-2 px-8 py-2.5 rounded-full font-semibold text-[14px]",
          "bg-slate-900 text-white",
          "hover:bg-slate-700 active:scale-95 transition-all duration-200",
          "shadow-lg shadow-black/10",
        )}
      >
        {isRunning && !isPaused ? (
          <><Pause size={15} strokeWidth={2.5} /> Pause</>
        ) : (
          <><Play size={15} strokeWidth={2.5} className="translate-x-[1px]" />{isPaused ? " Resume" : " Run"}</>
        )}
      </button>

      {/* TODO: assign functionality */}
      <button className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full transition-colors">
        <Plus size={17} strokeWidth={1.8} />
      </button>
    </div>
  )
}
