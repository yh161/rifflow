"use client"

import React from "react"
import { Pencil } from "lucide-react"
import { ActionButton, TextFormatBar } from "../../node_editor/_action_bar"
import type { ActionBarProps } from "../_action_bar_types"

const ease = "cubic-bezier(0.4, 0, 0.2, 1)"

export function ActionBarContent({ isTextEditing, onToggleTextEdit }: ActionBarProps) {
  return (
    <>
      <div
        className="flex items-center overflow-hidden"
        style={{
          maxWidth:      isTextEditing ? "0px"  : "220px",
          opacity:       isTextEditing ? 0      : 1,
          pointerEvents: isTextEditing ? "none" : "auto",
          transition:    `max-width 280ms ${ease}, opacity 180ms ${ease}`,
        }}
      >
        <ActionButton icon={Pencil} label="Edit seed" onClick={onToggleTextEdit} />
      </div>
      <div
        className="flex items-center overflow-hidden"
        style={{
          maxWidth:      isTextEditing ? "460px" : "0px",
          opacity:       isTextEditing ? 1       : 0,
          pointerEvents: isTextEditing ? "auto"  : "none",
          transition:    `max-width 280ms ${ease}, opacity 180ms ${ease}`,
        }}
      >
        <TextFormatBar onCollapse={onToggleTextEdit!} />
      </div>
    </>
  )
}
