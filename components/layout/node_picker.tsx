"use client"

/**
 * _node_picker.tsx
 *
 * Shared node-type picker panel used by:
 *  - Toolbar  (hover-to-open, closeMode="hover")
 *  - Canvas   (edge-drop / double-click, closeMode="outside")
 *
 * Favorites are shown first as a "Pinned" section when any exist.
 * Each row has a star toggle button on the right.
 */

import React, { useEffect, useRef } from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { MODULES } from "@/components/layout/modules/_registry"

// ─────────────────────────────────────────────
// Picker sections — built from module meta.category
// Add a new module with `category: 'Assets'` and it appears here automatically.
// ─────────────────────────────────────────────
function buildPickerSections() {
  const catMap = new Map<string, string[]>()
  for (const mod of MODULES) {
    const cat = mod.meta.category
    if (!cat) continue
    if (!catMap.has(cat)) catMap.set(cat, [])
    catMap.get(cat)!.push(mod.meta.id)
  }
  return Array.from(catMap.entries()).map(([cat, ids]) => ({
    id: cat, label: cat, moduleIds: ids,
  }))
}

export const PICKER_SECTIONS = buildPickerSections()

// ─────────────────────────────────────────────
// NodePickerMenu
// ─────────────────────────────────────────────
export interface NodePickerMenuProps {
  /** Called with the selected module id */
  onSelect: (typeId: string) => void

  /**
   * "hover"   — parent controls open/close via mouse enter/leave.
   * "outside" — component self-manages: closes on mousedown outside.
   */
  closeMode?: "hover" | "outside"
  onDismiss?: () => void

  // Favorites
  favorites?: string[]
  onToggleFavorite?: (typeId: string) => void

  // Positioning (applied to the outermost wrapper)
  left?: number | string
  top?: number | string
  transform?: string

  /** Whether to render the left-pointing arrow caret */
  showArrow?: boolean

  /** When true, only show favorited nodes (no section headers) */
  favoritesOnly?: boolean

  className?: string
}

export function NodePickerMenu({
  onSelect,
  closeMode = "hover",
  onDismiss,
  favorites = [],
  onToggleFavorite,
  left,
  top,
  transform,
  showArrow = true,
  favoritesOnly = false,
  className,
}: NodePickerMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)


  // "outside" mode — close on mousedown outside the menu
  useEffect(() => {
    if (closeMode !== "outside") return
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        onDismiss?.()
      }
    }
    window.addEventListener("mousedown", handle, true)
    return () => window.removeEventListener("mousedown", handle, true)
  }, [closeMode, onDismiss])

  // Collect all modules for the picker
  const modById = Object.fromEntries(MODULES.map((m) => [m.meta.id, m]))

  const pinnedMods = favorites
    .map((id) => modById[id])
    .filter(Boolean)

  return (
    <div
      ref={menuRef}
      style={{ position: "absolute", left, top, transform, zIndex: 50 }}
      className={cn("z-50", className)}
    >
      {showArrow && (
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white/50 rotate-45 rounded-[2px] border-l border-b border-slate-200/40 shadow-sm backdrop-blur-md" />
      )}

      <div
        className="relative bg-white/50 border border-slate-200/50 rounded-2xl p-2 min-w-[240px] shadow-xl shadow-black/[0.08] backdrop-blur-md"
        style={{ animation: "pickerIn 180ms ease-out both" }}
      >
        <style>{`
          @keyframes pickerIn {
            from { opacity: 0; transform: translateX(-6px) scale(0.97); }
            to   { opacity: 1; transform: translateX(0) scale(1); }
          }
        `}</style>

        {/* Sections or favorites-only */}
        {favoritesOnly ? (
          pinnedMods.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-5 px-4 text-center">
              <Star size={16} className="text-slate-200" />
              <p className="text-[11px] text-slate-300 leading-snug">
                Pin nodes with ★ to see them here
              </p>
            </div>
          ) : (
            <div className="transition-all duration-200">
              {pinnedMods.map((mod) => (
                <PickerRow
                  key={mod.meta.id}
                  mod={mod}
                  isFavorite
                  onSelect={() => { onSelect(mod.meta.id); onDismiss?.() }}
                  onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(mod.meta.id) : undefined}
                />
              ))}
            </div>
          )
        ) : (
          PICKER_SECTIONS.map((section) => {
            const sectionMods = section.moduleIds.map((id) => modById[id]).filter(Boolean)
            if (!sectionMods.length) return null
            return (
              <div key={section.id} className="mb-1 last:mb-0">
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-300">
                    {section.label}
                  </span>
                </div>
                {sectionMods.map((mod) => (
                  <PickerRow
                    key={mod.meta.id}
                    mod={mod}
                    isFavorite={favorites.includes(mod.meta.id)}
                    onSelect={() => { onSelect(mod.meta.id); onDismiss?.() }}
                    onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(mod.meta.id) : undefined}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PickerRow — single module entry
// ─────────────────────────────────────────────
function PickerRow({
  mod,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: {
  mod: (typeof MODULES)[number]
  isFavorite: boolean
  onSelect: () => void
  onToggleFavorite?: () => void
}) {
  const Icon = mod.meta.icon

  return (
    <div className="flex items-center gap-1 group/row rounded-xl hover:bg-slate-50 transition-colors duration-150">
      {/* Main click area */}
      <button
        onMouseDown={(e) => { e.stopPropagation(); onSelect() }}
        className="flex-1 flex items-center gap-3 px-3 py-2.5 active:scale-[0.98] group/item"
      >
        <div className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-slate-100",
          mod.meta.bg,
        )}>
          <Icon size={14} className={mod.meta.color} />
        </div>

        <div className="relative flex-1 flex flex-col justify-center min-w-0 h-8 overflow-hidden">
          <div className="flex items-center gap-1.5 transition-transform duration-200 ease-in-out group-hover/item:-translate-y-[7px]">
            <span className="text-[13px] font-medium text-slate-700 group-hover/item:text-slate-900 transition-colors whitespace-nowrap">
              {mod.meta.name}
            </span>
          </div>
          <span className={cn(
            "absolute bottom-0 left-0 text-[10px] text-slate-300 leading-tight truncate max-w-[140px]",
            "transition-all duration-200 ease-in-out opacity-0 translate-y-2",
            "group-hover/item:opacity-100 group-hover/item:translate-y-0",
          )}>
            {mod.meta.description}
          </span>
        </div>
      </button>

      {/* Star / favorite toggle */}
      {onToggleFavorite && (
        <button
          onMouseDown={(e) => { e.stopPropagation(); onToggleFavorite() }}
          title={isFavorite ? "Unpin" : "Pin to toolbar"}
          className={cn(
            "mr-2 p-1.5 rounded-lg shrink-0 transition-colors duration-150",
            "opacity-0 group-hover/row:opacity-80",
            isFavorite
              ? "opacity-100 text-slate-300 hover:text-slate-400"
              : "text-slate-200 hover:text-slate-400",
          )}
        >
          <Star
            size={12}
            strokeWidth={1.8}
            fill={isFavorite ? "currentColor" : "none"}
          />
        </button>
      )}
    </div>
  )
}