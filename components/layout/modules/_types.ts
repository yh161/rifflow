// ─────────────────────────────────────────────
// Shared types for all canvas modules
// ─────────────────────────────────────────────

export interface StandardNodeMediaFile {
  fileName: string
  src: string
  type: 'image' | 'video'
  rawFile?: File
}

export interface StandardNodeData {
  name?: string
  subType?: string
  label?: string
  properties?: Record<string, string | number | boolean>
  mediaFiles?: StandardNodeMediaFile[]
  onRefresh?: () => void
  onDetail?: () => void
  _snapshotFolder?: string
}

// Edge data for container nodes (Template)
export interface TemplateEdgeData {
  templateId?: string
  instanceIdx?: number
  templateEdgeId?: string
}


// Template child snapshot for instance cloning
export interface TemplateChildSnapshot {
  id:   string
  data: Record<string, unknown>
}
export interface TemplateInstance {
  id:       string
  modified: boolean
  children: TemplateChildSnapshot[]
  seedContent?: string
}

export interface FilterResultItem {
  id: string
  label?: string
  type?: string
}

export interface FilterResult {
  passed: FilterResultItem[]
  filtered: FilterResultItem[]
  reply?: string  // LLM's explanation / reason for filtering
}

export interface FilterOutputRule {
  range: string
}

export interface CustomNodeData {
  [key: string]: unknown
  label?: string
  type: 'text' | 'image' | 'video' | 'pdf' | 'filter' | 'template' | 'seed' | 'lasso'
  width?: number
  height?: number
  // text
  content?: string
  fontSize?: number
  align?: 'left' | 'center' | 'right'
  // image
  src?: string
  naturalWidth?: number
  naturalHeight?: number
  fileName?: string
  rawFile?: File
  rotation?: number  // rotation angle in degrees (0, 90, 180, 270)
  // video
  videoSrc?: string
  videoPoster?: string
  videoDuration?: string
  // pdf
  pdfSrc?: string
  pdfPageCount?: number
  pdfCurrentPage?: number
  pdfOutputRules?: Array<{ pages: string; dpi: number }>
  pdfOutputImages?: string[]
  pdfOutputPageNums?: number[]
  pdfPreviewDpi?: number
  pdfIncludeCurrentPage?: boolean
  pdfIncludeCurrentPageDpi?: number
  pdfAiRules?: Array<{ pages: string; dpi: number }>
  pdfPlanRaw?: string
  pdfPlanError?: string
  // container data (template)
  seedContent?: string
  templatePrompt?: string
  templateCount?: number    // max instances cap for template
  // DEPRECATED: use templateCount
  templateCountLegacy?: number
  currentInstance?: number   // -1 = template view, 0+ = instance index
  instanceCount?: number     // total instances (flat model)
  templateResolvedInstanceCount?: number // known from template seeds JSON before instances are materialized
  // DEPRECATED — old array-based instances (kept for backward compatibility with saved drafts)
  instances?: TemplateInstance[]
  // flat instance fields (on child nodes)
  templateId?: string        // which container this node belongs to
  // DEPRECATED: use templateId
  templateIdLegacy?: string
  instanceIdx?: number       // undefined = template child, 0+ = instance child
  templateNodeId?: string    // for cloned nodes: original template node id
  // inline preview (show prompt text below node on canvas)
  showPromptInline?: boolean
  // LLM fields
  prompt?:       string
  model?:        string
  mode?:         "auto" | "manual" | "note"
  done?:         boolean
  params?:       Record<string, string>  // generation params (duration, fps, style, etc.)
  videoSlots?:   Record<string, string>  // video model image slots: slotKey → nodeId ref
  isGenerating?: boolean
  generationProgress?: number
  generationStatusText?: string
  generationError?: string
  // filter
  filterInputMode?: 'label' | 'content'
  filterLatestInputOnly?: boolean
  filterReversed?: boolean
  filterOutputRules?: FilterOutputRule[]
  filterSelectedIds?: string[]
  filterResult?: FilterResult
  // shared
  isExpanded?: boolean
  isEditing?: boolean
  isLocked?: boolean
  isDragHovered?: boolean       // set transiently by canvas when an external node is dragged over this container
  isDragEjecting?: boolean      // set transiently when a child node is being forced against the container wall
  isDragEjectingReady?: boolean // set transiently when overshoot exceeds eject threshold (about to pop out)
  isSeed?: boolean           // auto-created Seed inside Batch containers
  // lasso
  lassoBgColor?: string      // hex color for lasso background tint (applied at ~25% opacity)
  onDataChange?: (updates: Partial<CustomNodeData>) => void
  onDelete?: () => void
}

export type AnyNodeData = StandardNodeData & CustomNodeData & Record<string, unknown>

export type NodeMode = "auto" | "manual" | "note"

export interface ModuleModalProps {
  data: AnyNodeData
  nodeId?: string  // Current node ID for upstream reference
  onUpdate: (updates: Partial<AnyNodeData>) => void
  onClose: () => void
  onConfirm?: () => void
  onDelete?: () => void
  mode?: NodeMode
  isGenerating?: boolean
  onGenerate?: (prompt: string, model: string, params: Record<string, string>, imageSlotNodeIds?: Record<string, string>) => void
  onStop?: () => void
  // For template — use existing template instance management
  onTemplateAddInstance?: (templateId: string, seedContent?: string) => void
  onTemplateSwitchView?: (templateId: string, viewIdx: number) => void
  // DEPRECATED: use onTemplateAddInstance
  onTemplateAddInstanceLegacy?: (templateIdLegacy: string, seedContent?: string) => void
  // DEPRECATED: use onTemplateSwitchView
  onTemplateSwitchViewLegacy?: (templateIdLegacy: string, viewIdx: number) => void
}
