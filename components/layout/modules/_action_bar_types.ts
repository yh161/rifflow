// Shared props passed to each module's ActionBarContent component

import type { CustomNodeData } from "./_types"

export type WorkflowControlStatus = "idle" | "running" | "paused"

export interface ActionBarProps {
  data: CustomNodeData

  // common
  onUpload?: () => void
  onDownload?: () => void
  onDelete?: () => void

  // text / seed
  isTextEditing?: boolean
  onToggleTextEdit?: () => void

  // filter
  onFilterModeChange?: (mode: 'label' | 'content') => void
  onFilterReverseToggle?: () => void

  // template
  onTemplateRelease?: () => void
  onTemplateAddInstance?: () => void
  onTemplateDeleteInstance?: () => void
  onTemplateGoTo?: (idx: number) => void
  templateInstanceCount?: number
  onTemplateRerunWorkflow?: () => void

  // lasso — workflow control
  onLassoDelete?: () => void
  onLassoRelease?: () => void
  onExecute?: () => void
  onLassoPause?: () => void
  onLassoResume?: () => void
  onLassoStop?: () => void
  onLassoBgColorChange?: (color: string | null) => void
  isExecuting?: boolean
  /** 'idle' | 'running' | 'paused' — drives lasso actionBar button state */
  workflowStatus?: WorkflowControlStatus

  // image
  onRotate?: () => void

  // pdf
  onPdfPrevPage?: () => void
  onPdfNextPage?: () => void
  onPdfSetPage?: (page: number) => void
  onPdfSetPreviewDpi?: (dpi: number) => void

  // inline preview toggle (text, seed)
  onToggleInlinePreview?: () => void
  inlinePreviewEnabled?: boolean
}
