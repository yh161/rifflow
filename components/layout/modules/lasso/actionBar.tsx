"use client"

import React from "react"
import { Play, Pause, Square, Ungroup, Trash2 } from "lucide-react"
import { ActionButton } from "../../node_editor/_action_bar"
import type { ActionBarProps } from "../_action_bar_types"

/**
 * Lasso action bar — three workflow control states:
 *
 *   idle:    [▶ Execute]  [Ungroup]
 *   running: [⏸ Pause]   [⏹ Stop]
 *   paused:  [▶ Resume]  [⏹ Stop]
 */
export function ActionBarContent({
  workflowStatus = "idle",
  onExecute,
  onLassoPause,
  onLassoResume,
  onLassoStop,
  onLassoRelease,
  onLassoDelete,
}: ActionBarProps) {
  if (workflowStatus === "running") {
    return (
      <>
        <ActionButton
          icon={Pause}
          label="Pause"
          onClick={onLassoPause}
        />
        <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
        <ActionButton
          icon={Square}
          label="Stop"
          onClick={onLassoStop}
          danger
        />
      </>
    )
  }

  if (workflowStatus === "paused") {
    return (
      <>
        <ActionButton
          icon={Play}
          label="Resume"
          onClick={onLassoResume}
        />
        <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
        <ActionButton
          icon={Square}
          label="Stop"
          onClick={onLassoStop}
          danger
        />
      </>
    )
  }

  // idle
  return (
    <>
      <ActionButton
        icon={Play}
        label="Execute"
        onClick={onExecute}
      />
      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
      <ActionButton icon={Ungroup} label="Release" onClick={onLassoRelease} />
      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
      <ActionButton icon={Trash2} label="Delete" onClick={onLassoDelete} danger />
    </>
  )
}
