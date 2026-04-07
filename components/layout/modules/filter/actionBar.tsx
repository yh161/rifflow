"use client"

import React from "react"
import { cn } from "@/lib/utils"
import type { ActionBarProps } from "../_action_bar_types"

export function ActionBarContent({ data, onFilterModeChange, onFilterReverseToggle }: ActionBarProps) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center bg-slate-100/70 rounded-full p-0.5">
        {(['label', 'content'] as const).map((m) => (
          <button
            key={m}
            onClick={() => onFilterModeChange?.(m)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[10.5px] font-medium transition-all duration-150 cursor-pointer",
              (data.filterInputMode ?? 'label') === m
                ? "bg-white text-amber-600 shadow-sm"
                : "text-slate-400 hover:text-slate-600",
            )}
          >
            {m === 'label' ? 'Label' : 'Content'}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onFilterReverseToggle?.()}
        className={cn(
          "px-2.5 py-1 rounded-full text-[10.5px] font-medium transition-all duration-150 cursor-pointer border",
          data.filterReversed
            ? "bg-amber-50 text-amber-600 border-amber-200"
            : "bg-slate-100/70 text-slate-500 border-slate-200 hover:text-slate-700",
        )}
        title="Reverse filter UI side"
      >
        Reverse
      </button>
    </div>
  )
}
