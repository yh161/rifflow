"use client"

import React, { useEffect, useRef } from "react"
import { Copy, Clipboard, Trash2 } from "lucide-react"

interface NodeContextMenuProps {
  x: number
  y: number
  onCopy: () => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}

export function NodeContextMenu({ x, y, onCopy, onDuplicate, onDelete, onClose }: NodeContextMenuProps) {
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
        onClick={() => { onCopy(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <Clipboard size={15} className="text-slate-500" />
        <span>Copy</span>
        <span className="ml-auto text-xs text-slate-400">⌘C</span>
      </button>
      <button
        onClick={() => { onDuplicate(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <Copy size={15} className="text-slate-500" />
        <span>Duplicate</span>
        <span className="ml-auto text-xs text-slate-400">⌘D</span>
      </button>
      <div className="h-px bg-slate-200 mx-2 my-1" />
      <button
        onClick={() => { onDelete(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 size={15} />
        <span>Delete</span>
        <span className="ml-auto text-xs text-red-300">⌫</span>
      </button>
    </div>
  )
}
