"use client"

import React, { useEffect, useRef } from "react"
import { Undo2, Redo2, ClipboardPaste, Lasso } from "lucide-react"

interface CanvasContextMenuProps {
  x: number
  y: number
  onUndo: () => void
  onRedo: () => void
  onPaste: () => void
  onStartLasso?: () => void
  onClose: () => void
  undoDisabled?: boolean
  redoDisabled?: boolean
  pasteDisabled?: boolean
}

export function CanvasContextMenu({
  x, y, onUndo, onRedo, onPaste, onStartLasso, onClose,
  undoDisabled, redoDisabled, pasteDisabled,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClose = () => onClose()
    window.addEventListener("click", handleClose)
    window.addEventListener("scroll", handleClose, true)
    return () => {
      window.removeEventListener("click", handleClose)
      window.removeEventListener("scroll", handleClose, true)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      style={{ position: "fixed", left: x, top: y, zIndex: 9999 }}
      className="min-w-[160px] rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        disabled={undoDisabled}
        onClick={() => { onUndo(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Undo2 size={15} className="text-slate-500" />
        <span>Undo</span>
        <span className="ml-auto text-xs text-slate-400">⌘Z</span>
      </button>
      <button
        disabled={redoDisabled}
        onClick={() => { onRedo(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Redo2 size={15} className="text-slate-500" />
        <span>Redo</span>
        <span className="ml-auto text-xs text-slate-400">⌘⇧Z</span>
      </button>
      <div className="h-px bg-slate-200 mx-2 my-1" />
      <button
        disabled={pasteDisabled}
        onClick={() => { onPaste(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ClipboardPaste size={15} className="text-slate-500" />
        <span>Paste</span>
        <span className="ml-auto text-xs text-slate-400">⌘V</span>
      </button>
      {onStartLasso && (
        <>
          <div className="h-px bg-slate-200 mx-2 my-1" />
          <button
            onClick={() => { onStartLasso(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Lasso size={15} className="text-slate-500" />
            <span>Lasso Select</span>
          </button>
        </>
      )}
    </div>
  )
}
