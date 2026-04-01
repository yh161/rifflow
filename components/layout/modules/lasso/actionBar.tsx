"use client"

import React from "react"
import { Play, Ungroup } from "lucide-react"
import { ActionButton } from "../../node_editor/_action_bar"
import type { ActionBarProps } from "../_action_bar_types"

export function ActionBarContent({ isExecuting, onExecute, onLassoRelease }: ActionBarProps) {
  return (
    <>
      <ActionButton
        icon={Play}
        label={isExecuting ? "Running..." : "Execute"}
        onClick={onExecute}
        disabled={isExecuting}
      />
      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
      <ActionButton icon={Ungroup} label="Release" onClick={onLassoRelease} />
    </>
  )
}
