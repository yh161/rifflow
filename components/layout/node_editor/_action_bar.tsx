"use client"

import React from "react"
import {
  Bold, Italic, Code, Quote, List,
  ChevronsLeft, AlignLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { CustomNodeData } from "../modules/_types"
import { MODULE_BY_ID } from "../modules/_registry"
import { insertMarkdown } from "../modules/_markdown_insert"

function ToolBtn({
  onClick,
  title,
  children,
  label,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  label?: string
}) {
  return (
    <button
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className="flex items-center gap-0.5 px-1.5 py-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
    >
      {children}
      {label && <span className="text-[10px] font-semibold leading-none">{label}</span>}
    </button>
  )
}

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
          ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
// NodeActionBar — dispatches to per-module ActionBarContent
// ─────────────────────────────────────────────
export function NodeActionBar({
  data,
  isTextEditing,
  onToggleTextEdit,
  onUpload,
  onDownload,
  onDelete,
  onFilterModeChange,
  onFilterReverseToggle,
  onTemplateRelease,
  onTemplateAddInstance,
  onTemplateDeleteInstance,
  onTemplateGoTo,
  templateInstanceCount,
  onTemplateRerunWorkflow,
  onLassoDelete,
  onLassoRelease,
  onExecute,
  onLassoPause,
  onLassoResume,
  onLassoStop,
  onLassoBgColorChange,
  isExecuting,
  workflowStatus,
  onRotate,
  onPdfPrevPage,
  onPdfNextPage,
  onPdfSetPage,
  onPdfSetPreviewDpi,
  inlinePreviewEnabled,
  onToggleInlinePreview,
}: {
  data: CustomNodeData
  isTextEditing: boolean
  onToggleTextEdit: () => void
  onUpload: () => void
  onDownload: () => void
  onDelete: () => void
  onFilterModeChange?: (mode: 'label' | 'content') => void
  onFilterReverseToggle?: () => void
  onTemplateRelease?: () => void
  onTemplateAddInstance?: () => void
  onTemplateDeleteInstance?: () => void
  onTemplateGoTo?: (idx: number) => void
  templateInstanceCount?: number
  onTemplateRerunWorkflow?: () => void
  onLassoDelete?: () => void
  onLassoRelease?: () => void
  onExecute?: () => void
  onLassoPause?: () => void
  onLassoResume?: () => void
  onLassoStop?: () => void
  onLassoBgColorChange?: (color: string | null) => void
  isExecuting?: boolean
  workflowStatus?: "idle" | "running" | "paused"
  onRotate?: () => void
  onPdfPrevPage?: () => void
  onPdfNextPage?: () => void
  onPdfSetPage?: (page: number) => void
  onPdfSetPreviewDpi?: (dpi: number) => void
  inlinePreviewEnabled?: boolean
  onToggleInlinePreview?: () => void
}) {
  const mod = data.type ? MODULE_BY_ID[data.type] : undefined
  const TypeBar = mod?.ActionBarContent

  return (
    <div className="flex items-center bg-white/50 backdrop-blur-md rounded-full shadow-md border border-slate-200/50 px-1 py-1">

      {TypeBar && (
        <TypeBar
          data={data}
          onUpload={onUpload}
          onDownload={onDownload}
          onDelete={onDelete}
          isTextEditing={isTextEditing}
          onToggleTextEdit={onToggleTextEdit}
          onFilterModeChange={onFilterModeChange}
          onFilterReverseToggle={onFilterReverseToggle}
          onTemplateRelease={onTemplateRelease}
          onTemplateAddInstance={onTemplateAddInstance}
          onTemplateDeleteInstance={onTemplateDeleteInstance}
          onTemplateGoTo={onTemplateGoTo}
          templateInstanceCount={templateInstanceCount}
          onTemplateRerunWorkflow={onTemplateRerunWorkflow}
          onLassoDelete={onLassoDelete}
          onLassoRelease={onLassoRelease}
          onExecute={onExecute}
          onLassoPause={onLassoPause}
          onLassoResume={onLassoResume}
          onLassoStop={onLassoStop}
          onLassoBgColorChange={onLassoBgColorChange}
          isExecuting={isExecuting}
          workflowStatus={workflowStatus}
          onRotate={onRotate}
          onPdfPrevPage={onPdfPrevPage}
          onPdfNextPage={onPdfNextPage}
          onPdfSetPage={onPdfSetPage}
          onPdfSetPreviewDpi={onPdfSetPreviewDpi}
        />
      )}

      {/* Inline preview toggle — shown for all types that have a panel */}
      {data.type !== 'lasso' && onToggleInlinePreview && (
        <>
          <div className="w-px h-4 bg-slate-200 mx-0.5 flex-shrink-0" />
          <ActionButton
            icon={AlignLeft}
            label={inlinePreviewEnabled ? "Hide inline" : "Show inline"}
            onClick={onToggleInlinePreview}
            className={inlinePreviewEnabled ? "text-slate-600" : ""}
          />
        </>
      )}

    </div>
  )
}