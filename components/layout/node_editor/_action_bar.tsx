"use client"

import React from "react"
import {
  Upload, Download, Trash2, Pencil,
  Bold, Italic, Code, Quote, List,
  ChevronsLeft,
  ChevronLeft, ChevronRight, Plus, LayoutTemplate,
  Play, Ungroup,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { CustomNodeData } from "../modules/_types"
import { insertMarkdown } from "../modules/_markdown_insert"

// ─────────────────────────────────────────────
// ActionButton
// ─────────────────────────────────────────────
export function ActionButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
  disabled = false,
  className,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  label: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "group flex items-center px-2 py-1.5 rounded-full cursor-pointer select-none transition-colors duration-500",
        danger
          ? "text-slate-400 hover:text-red-500 hover:bg-red-50"
          : "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
        disabled && "opacity-30 cursor-not-allowed pointer-events-none",
        className,
      )}
    >
      <Icon size={13} strokeWidth={2} className="flex-shrink-0" />
      <span className={cn(
        "overflow-hidden whitespace-nowrap text-xs font-medium",
        "max-w-0 group-hover:max-w-[120px] pl-0 group-hover:pl-1.5",
        "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
      )}>
        {label}
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────
// TextFormatBar — Markdown edition
// ─────────────────────────────────────────────
export function TextFormatBar({ onCollapse }: { onCollapse: () => void }) {
  const ToolBtn = ({
    onClick,
    title,
    children,
    label,
  }: {
    onClick: () => void
    title: string
    children: React.ReactNode
    label?: string
  }) => (
    <button
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className="flex items-center gap-0.5 px-1.5 py-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
    >
      {children}
      {label && <span className="text-[10px] font-semibold leading-none">{label}</span>}
    </button>
  )

  return (
    <div className="flex items-center gap-0.5 px-1">
      {/* Headings */}
      <ToolBtn title="Heading 1" onClick={() => insertMarkdown('# ', '', true)}  label="H1" ><span className="sr-only">H1</span></ToolBtn>
      <ToolBtn title="Heading 2" onClick={() => insertMarkdown('## ', '', true)} label="H2" ><span className="sr-only">H2</span></ToolBtn>
      <ToolBtn title="Heading 3" onClick={() => insertMarkdown('### ', '', true)}label="H3" ><span className="sr-only">H3</span></ToolBtn>

      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />

      {/* Inline */}
      <ToolBtn title="Bold"          onClick={() => insertMarkdown('**', '**')}><Bold   size={12} /></ToolBtn>
      <ToolBtn title="Italic"        onClick={() => insertMarkdown('*',  '*' )}><Italic size={12} /></ToolBtn>
      <ToolBtn title="Inline code"   onClick={() => insertMarkdown('`',  '`' )}><Code   size={12} /></ToolBtn>

      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />

      {/* Block */}
      <ToolBtn title="Blockquote"    onClick={() => insertMarkdown('> ',   '', true)}><Quote size={12} /></ToolBtn>
      <ToolBtn title="Bullet list"   onClick={() => insertMarkdown('- ',   '', true)}><List  size={12} /></ToolBtn>

      <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />

      <button
        onClick={onCollapse}
        title="Close text editor"
        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
      >
        <ChevronsLeft size={12} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// ContainerActionBar — for Template nodes
// (flat instance model)
// ─────────────────────────────────────────────
function ContainerActionBar({
  instanceCount,
  currentInstance,
  onRelease,
  onAddInstance,
  onDeleteInstance,
  onGoTo,
  isGenerating,
}: {
  instanceCount: number
  currentInstance: number
  onRelease: () => void
  onAddInstance: () => void
  onDeleteInstance: () => void
  onGoTo: (idx: number) => void
  isGenerating?: boolean
}) {
  const isTemplate = currentInstance === -1
  const total      = instanceCount
  const releaseLabel = "Release template"

  const NavBtn = ({
    onClick,
    disabled,
    title,
    children,
  }: {
    onClick: () => void
    disabled?: boolean
    title: string
    children: React.ReactNode
  }) => (
    <button
      onClick={onClick}
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

  // ── Generating state — show running indicator ──
  if (isGenerating) {
    return (
      <>
        <ActionButton
          icon={Play}
          label="Generating..."
          disabled={true}
          className="text-indigo-500"
        />
        <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
        <ActionButton icon={Trash2} label={releaseLabel} onClick={onRelease} danger />
      </>
    )
  }

  // ── State 1: Template view, zero instances — minimal bar ──
  if (isTemplate && total === 0) {
    return (
      <>
        <ActionButton icon={Plus}   label="Add instance" onClick={onAddInstance} />
        <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
        <ActionButton icon={Trash2} label={releaseLabel} onClick={onRelease} danger />
      </>
    )
  }

  // ── State 2 & 3: Has instances — full navigation bar ──
  // Template button: active (highlighted) when isTemplate, clickable when not
  return (
    <>
      {/* Template toggle */}
      <button
        onClick={isTemplate ? undefined : () => onGoTo(-1)}
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

      {/* Prev */}
      <NavBtn
        onClick={() => onGoTo(isTemplate ? 0 : Math.max(0, currentInstance - 1))}
        disabled={!isTemplate && currentInstance <= 0}
        title="Previous instance"
      >
        <ChevronLeft size={13} />
      </NavBtn>

      {/* Dot indicators — none highlighted when viewing template */}
      <div className="flex items-center gap-1 px-1">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onClick={() => onGoTo(i)}
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

      {/* Next */}
      <NavBtn
        onClick={() => onGoTo(isTemplate ? 0 : Math.min(total - 1, currentInstance + 1))}
        disabled={!isTemplate && currentInstance >= total - 1}
        title="Next instance"
      >
        <ChevronRight size={13} />
      </NavBtn>

      {/* Counter — show "T / n" when on template, "i / n" when on instance */}
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

      <ActionButton icon={Plus} label="Add instance" onClick={onAddInstance} />

      {/* Release when on template, Delete instance when on instance */}
      {isTemplate ? (
        <ActionButton icon={Trash2} label={releaseLabel} onClick={onRelease} danger />
      ) : (
        <ActionButton icon={Trash2} label="Delete instance" onClick={onDeleteInstance} danger />
      )}
    </>
  )
}

// ─────────────────────────────────────────────
// NodeActionBar
// ─────────────────────────────────────────────
export function NodeActionBar({
  data,
  isTextEditing,
  onToggleTextEdit,
  onUpload,
  onDownload,
  onDelete,
  // filter-specific
  onFilterModeChange,
  // loop-specific
  onLoopRelease,
  onLoopAddInstance,
  onLoopDeleteInstance,
  onLoopGoTo,
  loopInstanceCount,
  // lasso-specific
  onLassoRelease,
  onExecute,
  isExecuting,
}: {
  data: CustomNodeData
  isTextEditing: boolean
  onToggleTextEdit: () => void
  onUpload: () => void
  onDownload: () => void
  onDelete: () => void
  onFilterModeChange?: (mode: 'label' | 'content') => void
  onLoopRelease?: () => void
  onLoopAddInstance?: () => void
  onLoopDeleteInstance?: () => void
  onLoopGoTo?: (idx: number) => void
  loopInstanceCount?: number
  onLassoRelease?: () => void
  onExecute?: () => void
  isExecuting?: boolean
}) {
  const ease = "cubic-bezier(0.4, 0, 0.2, 1)"

  return (
    <div className="flex items-center bg-white/90 backdrop-blur-md rounded-full shadow-md border border-slate-200/80 px-1 py-1">

      {(data.type === "image" || data.type === "video") && (
        <>
          <ActionButton icon={Upload}   label="Upload"   onClick={onUpload}   />
          <ActionButton icon={Download} label="Download" onClick={onDownload} />
          <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
          <ActionButton icon={Trash2}   label="Delete"   onClick={onDelete}   danger />
        </>
      )}

      {data.type === "text" && (
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
            <ActionButton icon={Pencil} label="Edit"   onClick={onToggleTextEdit} />
            <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
            <ActionButton icon={Trash2} label="Delete" onClick={onDelete} danger />
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
            <TextFormatBar onCollapse={onToggleTextEdit} />
          </div>
        </>
      )}

      {data.type === "seed" && (
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
            <TextFormatBar onCollapse={onToggleTextEdit} />
          </div>
        </>
      )}

      {data.type === "filter" && (
        <>
          {/* Input mode toggle */}
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
          <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
          <ActionButton icon={Trash2} label="Delete" onClick={onDelete} danger />
        </>
      )}

      {data.type === "template" && (
        <ContainerActionBar
          instanceCount={loopInstanceCount ?? data.instanceCount ?? 0}
          currentInstance={data.currentInstance ?? -1}
          onRelease={onLoopRelease ?? onDelete}
          onAddInstance={onLoopAddInstance ?? (() => {})}
          onDeleteInstance={onLoopDeleteInstance ?? (() => {})}
          onGoTo={onLoopGoTo ?? (() => {})}
          isGenerating={isExecuting}
        />
      )}

      {data.type === "lasso" && (
        <>
          <ActionButton
            icon={Play}
            label={isExecuting ? "Running..." : "Execute"}
            onClick={onExecute}
            disabled={isExecuting}
          />
          <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
          <ActionButton icon={Ungroup} label="Release" onClick={onLassoRelease} />
          <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
          <ActionButton icon={Trash2} label="Delete" onClick={onDelete} danger />
        </>
      )}

    </div>
  )
}