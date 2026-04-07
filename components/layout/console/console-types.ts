// ─────────────────────────────────────────────
// Console — Shared types
// ─────────────────────────────────────────────

/** Mirrors WorkflowGateStatus from workflow.service.ts */
export type ConsoleNodeStatus =
  | "queueing_in_workflow"
  | "waiting_upstream"
  | "queueing_job"
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "paused"
  | "waiting_manual"

/** Overall console phase — driven by WorkflowJob.status */
export type ConsolePhase =
  | "ready"
  | "running"
  | "paused"
  | "paused_manual"
  | "complete"
  | "stopped"
  | "error"

export type TaskStatus = "pending" | "running" | "done" | "error" | "skipped" | "waiting_manual"

export interface ConsoleTask {
  nodeId: string
  label: string
  type: string
  estimatedCost: number
  mode: "auto" | "manual" | "note"
  done: boolean
  hasPrompt: boolean
  status: TaskStatus
  /** DAG level — nodes in same batch run in parallel (kept for display) */
  batchIndex: number
  jobId?: string
  duration?: number
  error?: string
  startedAt?: number
}
