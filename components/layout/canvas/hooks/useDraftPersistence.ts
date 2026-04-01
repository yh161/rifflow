"use client"

import type { MutableRefObject } from "react"
import type { Node, Edge } from "reactflow"

interface UseDraftPersistenceParams {
  status: "loading" | "authenticated" | "unauthenticated"
  nodesRef: MutableRefObject<Node[]>
  edgesRef: MutableRefObject<Edge[]>
}

interface CreateDraftParams {
  name: string
  nodes: Node[]
  edges: Edge[]
  thumbnail?: string
  publish?: boolean
}

/**
 * Encapsulates community-draft persistence workflows used by canvas.tsx.
 *
 * Why:
 * - Avoid repeated PATCH/POST boilerplate across canvas:load / canvas:new / import flows
 * - Keep naming strategy consistent
 * - Centralize event dispatch for draft list refresh
 */
export function useDraftPersistence({ status, nodesRef, edgesRef }: UseDraftPersistenceParams) {
  const canPersist = status === "authenticated"

  const timeLabel = () =>
    new Date().toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  const makeUntitledName = (prefix: string) => `${prefix} ${timeLabel()}`

  const patchDraftSnapshot = async (draftId: string, nodes: Node[], edges: Edge[]) => {
    const res = await fetch(`/api/community/templates/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canvasSnapshot: { nodes, edges } }),
    })
    return res.ok
  }

  const createDraft = async ({ name, nodes, edges, thumbnail, publish = false }: CreateDraftParams) => {
    if (!canPersist) return null

    const res = await fetch("/api/community/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        thumbnail,
        canvasSnapshot: { nodes, edges },
        publish,
      }),
    })

    if (!res.ok) return null
    const { template } = await res.json()
    window.dispatchEvent(new CustomEvent("template:saved"))
    return template?.id as string | undefined
  }

  const saveCurrentCanvas = async (opts?: { existingDraftId?: string | null; fallbackNamePrefix?: string }) => {
    if (!canPersist) return null

    const nodes = nodesRef.current
    const edges = edgesRef.current
    if (nodes.length === 0) return null

    const existingDraftId = opts?.existingDraftId ?? null
    const fallbackNamePrefix = opts?.fallbackNamePrefix ?? "未命名工作流"

    if (existingDraftId) {
      const patched = await patchDraftSnapshot(existingDraftId, nodes, edges)
      if (patched) {
        window.dispatchEvent(new CustomEvent("template:saved"))
        return existingDraftId
      }
      return null
    }

    return createDraft({
      name: makeUntitledName(fallbackNamePrefix),
      nodes,
      edges,
      publish: false,
    })
  }

  return {
    canPersist,
    timeLabel,
    makeUntitledName,
    createDraft,
    saveCurrentCanvas,
  }
}
