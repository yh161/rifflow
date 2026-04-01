// Shared props passed to each module's ActionBarContent component

import type { CustomNodeData } from "./_types"

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

  // template
  onTemplateRelease?: () => void
  onTemplateAddInstance?: () => void
  onTemplateDeleteInstance?: () => void
  onTemplateGoTo?: (idx: number) => void
  templateInstanceCount?: number

  // lasso
  onLassoRelease?: () => void
  onExecute?: () => void
  isExecuting?: boolean

  // image
  onRotate?: () => void

  // pdf
  onPdfPrevPage?: () => void
  onPdfNextPage?: () => void
  onPdfSetPage?: (page: number) => void
  onPdfSetPreviewDpi?: (dpi: number) => void
}
