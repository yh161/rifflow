"use client"

import React from "react"
import type { WorkflowMeta } from "./run-detail"

const GRADIENTS = [
  ["#667eea", "#764ba2"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#43e97b", "#38f9d7"],
  ["#fa709a", "#fee140"],
  ["#a18cd1", "#fbc2eb"],
]

function getCoverGradient(name: string) {
  const idx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % GRADIENTS.length
  const [from, to] = GRADIENTS[idx]
  return `linear-gradient(135deg, ${from}, ${to})`
}

interface RunDetailHeaderProps {
  meta: WorkflowMeta
}

export function RunDetailHeader({ meta }: RunDetailHeaderProps) {
  return (
    <div className="px-6 pt-2 pb-5">
      {/* Cover art */}
      <div
        className="w-full aspect-square rounded-2xl overflow-hidden shadow-xl shadow-black/20 mb-5 flex items-center justify-center"
        style={{ background: meta.coverImage ? undefined : getCoverGradient(meta.name) }}
      >
        {meta.coverImage ? (
          <img src={meta.coverImage} alt={meta.name} className="w-full h-full object-cover" />
        ) : (
          <span
            className="text-white/20 font-bold select-none"
            style={{ fontSize: 80 }}
          >
            {meta.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Metadata */}
      <h1 className="text-[20px] font-bold text-slate-900 leading-tight">{meta.name}</h1>
      <p className="text-[14px] text-slate-500 mt-0.5">{meta.author}</p>
      <p className="text-[12px] text-slate-400 mt-0.5 font-mono">
        {meta.type} · {meta.createdAt.getFullYear()}
      </p>
    </div>
  )
}
