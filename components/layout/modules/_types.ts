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

// Edge data for container nodes (Batch / Cycle)
export interface LoopEdgeData {
  loopId?: string
  instanceIdx?: number
  templateEdgeId?: string
}

// DEPRECATED — kept for migration
export interface LoopChildSnapshot {
  id:   string
  data: Record<string, any>
}
export interface LoopInstance {
  id:       string
  modified: boolean
  children: LoopChildSnapshot[]
  seedContent?: string
}

export interface CustomNodeData {
  label?: string
  type: 'text' | 'image' | 'video' | 'gate' | 'batch' | 'cycle' | 'seed' | 'lasso'
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
  // video
  videoSrc?: string
  videoPoster?: string
  videoDuration?: string
  // container data (batch / cycle)
  seedContent?: string
  loopPrompt?: string        // cycle only
  batchPrompt?: string       // batch only
  loopCount?: number
  currentInstance?: number   // -1 = template view, 0+ = instance index
  instanceCount?: number     // total instances (flat model)
  // DEPRECATED — old array-based instances
  instances?: LoopInstance[]
  // flat instance fields (on child nodes)
  loopId?: string            // which container this node belongs to
  instanceIdx?: number       // undefined = template child, 0+ = instance child
  templateNodeId?: string    // for cloned nodes: original template node id
  // LLM fields
  prompt?:       string
  model?:        string
  mode?:         "auto" | "manual"
  params?:       Record<string, string>  // generation params (duration, fps, style, etc.)
  isGenerating?: boolean
  // shared
  isExpanded?: boolean
  isEditing?: boolean
  isLocked?: boolean
  isSeed?: boolean           // auto-created Seed inside Batch containers
  onDataChange?: (updates: Partial<CustomNodeData>) => void
  onDelete?: () => void
}

export type AnyNodeData = StandardNodeData & CustomNodeData & Record<string, unknown>

export type NodeMode = "auto" | "manual"

export interface ModuleModalProps {
  data: AnyNodeData
  nodeId?: string  // Current node ID for upstream reference
  onUpdate: (updates: Partial<AnyNodeData>) => void
  onClose: () => void
  onConfirm?: () => void
  onDelete?: () => void
  mode?: NodeMode
  isGenerating?: boolean
  onGenerate?: (prompt: string, model: string, params: Record<string, string>) => void
  onStop?: () => void
  // For batch/cycle — use existing loop instance management
  onLoopAddInstance?: (loopId: string, seedContent?: string) => void
  onLoopSwitchView?: (loopId: string, viewIdx: number) => void
}
