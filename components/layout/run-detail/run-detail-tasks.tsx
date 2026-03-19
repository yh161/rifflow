"use client"

import React from "react"
import type { WorkflowTask } from "./run-detail"
import { RunDetailTaskItem } from "./run-detail-task-item"

export function RunDetailTasks({ tasks }: { tasks: WorkflowTask[] }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-5 py-2">
        <span className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider">Steps</span>
        <span className="text-[11px] text-slate-400">{tasks.length} tasks</span>
      </div>
      {tasks.map((task, i) => (
        <div key={task.id}>
          <RunDetailTaskItem task={task} />
          {i < tasks.length - 1 && <div className="mx-5 h-px bg-slate-100" />}
        </div>
      ))}
    </div>
  )
}
