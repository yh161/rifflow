"use client"

import React from "react"
import {
  Plus, Trash2, Play, LayoutTemplate,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ActionButton } from "../../node_editor/_action_bar"
import type { ActionBarProps } from "../_action_bar_types"

function NavBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded-full transition-colors",
        disabled
          ? "text-indigo-200 cursor-not-allowed"
          : "text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50",
      )}
    >
      {children}
    </button>
  )
}

export function ActionBarContent({
  data,
  onTemplateRelease,
  onTemplateAddInstance,
  onTemplateDeleteInstance,
  onTemplateGoTo,
  templateInstanceCount,
  isExecuting,
  onDelete,
}: ActionBarProps) {
  const instanceCount   = templateInstanceCount ?? data.instanceCount ?? 0
  const currentInstance  = data.currentInstance ?? -1
  const isTemplate      = currentInstance === -1
  const total           = instanceCount
  const releaseLabel    = "Release template"

  // Generating state
  if (isExecuting) {
    return (
      <>
        <ActionButton icon={Play} label="Generating..." disabled className="text-indigo-500" />
        <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
        <ActionButton icon={Trash2} label={releaseLabel} onClick={onTemplateRelease ?? onDelete} danger />
      </>
    )
  }

  // Template view, zero instances
  if (isTemplate && total === 0) {
    return (
      <>
        <ActionButton icon={Plus} label="Add instance" onClick={onTemplateAddInstance} />
        <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
        <ActionButton icon={Trash2} label={releaseLabel} onClick={onTemplateRelease ?? onDelete} danger />
      </>
    )
  }

  // Has instances — full navigation bar
  return (
    <>
      <button
        onMouseDown={(e) => { e.preventDefault(); if (!isTemplate) onTemplateGoTo?.(-1) }}
        title={isTemplate ? "Viewing template" : "Back to template"}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors",
          isTemplate
            ? "bg-indigo-100 text-indigo-600"
            : "text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50",
        )}
      >
        <LayoutTemplate size={11} />
        <span>Template</span>
      </button>

      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />

      <NavBtn
        onClick={() => onTemplateGoTo?.(isTemplate ? 0 : Math.max(0, currentInstance - 1))}
        disabled={!isTemplate && currentInstance <= 0}
        title="Previous instance"
      >
        <ChevronLeft size={13} />
      </NavBtn>

      <div className="flex items-center gap-1 px-1">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onMouseDown={(e) => { e.preventDefault(); onTemplateGoTo?.(i) }}
            title={`Instance ${i + 1}`}
            className={cn(
              "rounded-full transition-all duration-150",
              i === currentInstance
                ? "w-4 h-1.5 bg-indigo-500"
                : "w-1.5 h-1.5 bg-indigo-200 hover:bg-indigo-400",
            )}
          />
        ))}
      </div>

      <NavBtn
        onClick={() => onTemplateGoTo?.(isTemplate ? 0 : Math.min(total - 1, currentInstance + 1))}
        disabled={!isTemplate && currentInstance >= total - 1}
        title="Next instance"
      >
        <ChevronRight size={13} />
      </NavBtn>

      <span className="text-[11px] text-indigo-400 tabular-nums px-1 select-none">
        {isTemplate ? (
          <>
            <span className="text-indigo-500 font-medium">T</span>
            <span className="text-indigo-300"> / {total}</span>
          </>
        ) : (
          <>
            {currentInstance + 1}
            <span className="text-indigo-300"> / {total}</span>
          </>
        )}
      </span>

      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />

      <ActionButton icon={Plus} label="Add instance" onClick={onTemplateAddInstance} />

      {isTemplate ? (
        <ActionButton icon={Trash2} label={releaseLabel} onClick={onTemplateRelease ?? onDelete} danger />
      ) : (
        <ActionButton icon={Trash2} label="Delete instance" onClick={onTemplateDeleteInstance} danger />
      )}
    </>
  )
}
