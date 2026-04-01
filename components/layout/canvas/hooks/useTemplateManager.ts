"use client"

import { Node, Edge } from "reactflow"
import type { TemplateEdgeData } from "@/components/layout/modules/_types"
import { CanvasState } from "./useCanvasState"

// ─────────────────────────────────────────────
// Return type for batch instance creation
// ─────────────────────────────────────────────
export interface BatchInstanceResult {
  instances: Array<{
    instanceIdx: number
    /** All nodes for this instance (cloned internal + external pre-resolved) */
    nodes: Node[]
    /** All edges relevant to this instance */
    edges: Edge[]
    /** The seed node's ID in this instance (if any) */
    seedNodeId?: string
  }>
}

/**
 * Template instance management logic extracted from canvas.tsx
 * Handles all template-related operations: adding instances, switching views,
 * deleting instances, releasing templates.
 */
export function useTemplateManager(canvasState: CanvasState) {
  const { nodesRef, edgesRef, setNodes, setEdges } = canvasState

  // ─────────────────────────────────────────────
  // Helper functions
  // ─────────────────────────────────────────────

  const generateId = (prefix: string) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }

  /**
   * Recursively collect template children of a template node.
   * For nested templates, this also collects the inner template's children
   * so that when the outer template is cloned, everything inside is duplicated.
   */
  const collectTemplateTree = (templateId: string, allNodes: Node[]) => {
    const directChildren = allNodes.filter(
      (n) => n.parentNode === templateId && n.data?.instanceIdx === undefined
    )
    const result: Node[] = [...directChildren]
    for (const child of directChildren) {
      if (child.type === 'TemplateNode') {
        result.push(...collectTemplateTree(child.id, allNodes))
      }
    }
    return result
  }

  /**
   * Clone a set of template nodes for a new instance.
   * Returns { clonedNodes, idMapping } where idMapping maps old→new IDs.
   * Handles nested templates: inner template nodes get new IDs and their
   * children are re-parented accordingly.
   */
  const cloneNodesForInstance = (
    templateNodes: Node[],
    outerTemplateId: string,
    instanceIdx: number,
  ): { clonedNodes: Node[]; idMapping: Map<string, string> } => {
    const idMapping = new Map<string, string>()

    // Pre-generate new IDs for all template nodes
    for (const n of templateNodes) {
      idMapping.set(n.id, generateId(n.data?.type ?? 'clone'))
    }

    const clonedNodes: Node[] = templateNodes.map((n) => {
      const newId = idMapping.get(n.id)!
      const newParent = n.parentNode ? (idMapping.get(n.parentNode) ?? n.parentNode) : n.parentNode
      const effectiveTemplateId = n.parentNode === outerTemplateId
        ? outerTemplateId
        : n.data?.templateId ?? outerTemplateId

      return {
        ...n,
        id: newId,
        parentNode: newParent,
        data: {
          ...n.data,
          templateId: effectiveTemplateId,
          instanceIdx: n.parentNode === outerTemplateId ? instanceIdx : n.data?.instanceIdx,
          templateNodeId: n.id,
          // Clear runtime-injected callbacks
          onDataChange: undefined,
          onDelete: undefined,
          isEditing: false,
        },
        hidden: true,
        selected: false,
      }
    })

    // For nodes nested inside an inner template, mark them with the outer
    // template's instance info so visibility toggling works.
    for (const clone of clonedNodes) {
      if (clone.parentNode !== outerTemplateId) {
        clone.data = {
          ...clone.data,
          templateId: outerTemplateId,
          instanceIdx: instanceIdx,
        }
      }
    }

    return { clonedNodes, idMapping }
  }

  /**
   * Translate {{templateNodeId}} → {{instanceNodeId}} in prompt strings.
   */
  const translatePromptRefs = (
    clonedNodes: Node[],
    idMapping: Map<string, string>,
  ): Node[] => {
    return clonedNodes.map((n) => {
      const prompt = n.data?.prompt
      if (!prompt || typeof prompt !== 'string' || !prompt.includes('{{')) return n
      const translated = prompt.replace(/\{\{([^}]+)\}\}/g, (_: string, ref: string) => {
        const newId = idMapping.get(ref.trim())
        return newId ? `{{${newId}}}` : `{{${ref.trim()}}}`
      })
      return translated === prompt ? n : { ...n, data: { ...n.data, prompt: translated } }
    })
  }

  /**
   * Clone edges that connect to template children.
   * Catches ALL edge types:
   *  - Internal (both ends are template children)
   *  - External-in (source outside template, target is template child)
   *  - External-out (source is template child, target outside template)
   *  - Untagged edges (no templateId metadata — regular user-drawn edges)
   *  - Tagged template edges (templateId set, no instanceIdx)
   *
   * Skips edges that already belong to another instance (instanceIdx defined).
   */
  const cloneEdgesForInstance = (
    allEdges: Edge[],
    idMapping: Map<string, string>,
    templateNodeIds: Set<string>,
    outerTemplateId: string,
    instanceIdx: number,
  ): Edge[] => {
    const clonedEdges: Edge[] = []

    for (const edge of allEdges) {
      if ((edge.data as TemplateEdgeData | undefined)?.instanceIdx !== undefined) continue

      const srcIsTemplate = templateNodeIds.has(edge.source)
      const tgtIsTemplate = templateNodeIds.has(edge.target)

      if (!srcIsTemplate && !tgtIsTemplate) continue

      const newEdge: Edge = {
        ...edge,
        id: generateId('edge'),
        source: srcIsTemplate ? (idMapping.get(edge.source) ?? edge.source) : edge.source,
        target: tgtIsTemplate ? (idMapping.get(edge.target) ?? edge.target) : edge.target,
        data: {
          ...(edge.data ?? {}),
          templateId: outerTemplateId,
          instanceIdx: instanceIdx,
          templateEdgeId: edge.id,
        } as TemplateEdgeData,
        hidden: true,
        selected: false,
      }
      clonedEdges.push(newEdge)
    }

    return clonedEdges
  }

  /**
   * Apply visibility: show template OR a specific instance for a given template.
   * viewIdx: -1 = show template, 0+ = show that instance
   */
  const applyTemplateVisibility = (
    nodes: Node[],
    edges: Edge[],
    templateId: string,
    viewIdx: number,
  ): { nodes: Node[]; edges: Edge[] } => {
    const visibleNodeIds = new Set<string>()

    const updatedNodes = nodes.map((n) => {
      if (n.parentNode !== templateId && n.data?.templateId !== templateId) {
        if (!n.hidden) visibleNodeIds.add(n.id)
        return n
      }

      const nodeInstIdx = n.data?.instanceIdx
      let shouldShow: boolean
      if (viewIdx === -1) {
        shouldShow = nodeInstIdx === undefined
      } else {
        shouldShow = nodeInstIdx === viewIdx
      }

      if (shouldShow) visibleNodeIds.add(n.id)
      if (n.hidden === !shouldShow) return n
      return { ...n, hidden: !shouldShow }
    })

    for (const n of updatedNodes) {
      if (!n.hidden) visibleNodeIds.add(n.id)
    }

    const updatedEdges = edges.map((e) => {
      const edgeTemplateId = (e.data as TemplateEdgeData | undefined)?.templateId
      const edgeInstIdx = (e.data as TemplateEdgeData | undefined)?.instanceIdx

      if (edgeTemplateId === templateId) {
        let shouldShow: boolean
        if (viewIdx === -1) {
          shouldShow = edgeInstIdx === undefined
        } else {
          shouldShow = edgeInstIdx === viewIdx
        }
        if (e.hidden === !shouldShow) return e
        return { ...e, hidden: !shouldShow }
      }

      const bothVisible = visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      const srcNode = updatedNodes.find((n) => n.id === e.source)
      const tgtNode = updatedNodes.find((n) => n.id === e.target)
      const srcIsTemplateChild = srcNode?.parentNode === templateId && srcNode?.data?.instanceIdx === undefined
      const tgtIsTemplateChild = tgtNode?.parentNode === templateId && tgtNode?.data?.instanceIdx === undefined

      if (srcIsTemplateChild || tgtIsTemplateChild) {
        const shouldShow = viewIdx === -1 ? bothVisible : false
        if (e.hidden === !shouldShow && e.data?.templateId === templateId) return e
        return {
          ...e,
          hidden: !shouldShow,
          data: { ...(e.data ?? {}), templateId } as TemplateEdgeData,
        }
      }

      if (e.hidden === !bothVisible) return e
      return { ...e, hidden: !bothVisible }
    })

    return { nodes: updatedNodes, edges: updatedEdges }
  }

  // ─────────────────────────────────────────────
  // Template instance management operations
  // ─────────────────────────────────────────────

  /**
   * Add a single new instance to a template.
   * Used by the UI "add instance" button.
   */
  const handleTemplateAddInstance = (templateId: string) => {
    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    const templateNode = prevNodes.find((n) => n.id === templateId)
    if (!templateNode) return

    const currentCount = templateNode.data?.instanceCount ?? 0
    const currentInstance = templateNode.data?.currentInstance ?? -1
    // Insert right after the currently viewed instance.
    // If currently in template view, append to the end.
    const insertIdx = currentInstance >= 0 ? Math.min(currentInstance + 1, currentCount) : currentCount
    const newIdx = insertIdx

    const templateNodes = collectTemplateTree(templateId, prevNodes)
    if (templateNodes.length === 0) return

    const { clonedNodes: rawCloned, idMapping } = cloneNodesForInstance(templateNodes, templateId, newIdx)
    const clonedNodes = translatePromptRefs(rawCloned, idMapping)

    const templateNodeIds = new Set(templateNodes.map((n) => n.id))
    const clonedEdges = cloneEdgesForInstance(prevEdges, idMapping, templateNodeIds, templateId, newIdx)

    // Shift existing instance indices to the right when inserting in the middle.
    const shiftedNodes = prevNodes.map((n) => {
      if (n.data?.templateId !== templateId) return n
      const idx = n.data?.instanceIdx
      if (idx !== undefined && idx >= insertIdx) {
        return { ...n, data: { ...n.data, instanceIdx: idx + 1 } }
      }
      return n
    })

    const shiftedEdges = prevEdges.map((e) => {
      const eData = e.data as TemplateEdgeData | undefined
      if (eData?.templateId !== templateId) return e
      const idx = eData?.instanceIdx
      if (idx !== undefined && idx >= insertIdx) {
        return { ...e, data: { ...e.data, instanceIdx: idx + 1 } }
      }
      return e
    })

    // Build new nodes
    let newNodes = shiftedNodes.map((n) => {
      if (n.id === templateId) {
        return { ...n, data: { ...n.data, instanceCount: currentCount + 1, currentInstance: newIdx } }
      }
      if (n.parentNode === templateId || n.data?.templateId === templateId) {
        return n.hidden ? n : { ...n, hidden: true }
      }
      return n
    })
    newNodes = [...newNodes, ...clonedNodes.map((n) => ({ ...n, hidden: false }))]

    // Build new edges
    let newEdges = shiftedEdges.map((e) => {
      const eData = e.data as TemplateEdgeData | undefined
      if (eData?.templateId === templateId) {
        return e.hidden ? e : { ...e, hidden: true }
      }
      if (templateNodeIds.has(e.source) || templateNodeIds.has(e.target)) {
        return { ...e, hidden: true, data: { ...(e.data ?? {}), templateId } as TemplateEdgeData }
      }
      return e
    })
    newEdges = [...newEdges, ...clonedEdges.map((e) => ({ ...e, hidden: false }))]

    setNodes(newNodes)
    setEdges(newEdges)
  }

  /**
   * Batch-create multiple instances in a single state update.
   * Returns the instance data needed for backend workflow execution.
   *
   * CRITICAL: This avoids the race condition of calling handleTemplateAddInstance
   * in a loop, where nodesRef is stale because useEffect hasn't synced yet.
   * All instances are created from the same snapshot in one setNodes/setEdges call.
   */
  const handleTemplateAddInstances = (
    templateId: string,
    count: number,
    seedContents?: string[],
  ): BatchInstanceResult | null => {
    if (count <= 0) return null

    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    const templateNode = prevNodes.find((n) => n.id === templateId)
    if (!templateNode) return null

    const currentCount = templateNode.data?.instanceCount ?? 0
    const templateNodes = collectTemplateTree(templateId, prevNodes)
    if (templateNodes.length === 0) return null

    const templateNodeIds = new Set(templateNodes.map((n) => n.id))

    // Accumulate all cloned data across instances
    const allClonedNodes: Node[] = []
    const allClonedEdges: Edge[] = []
    const resultInstances: BatchInstanceResult['instances'] = []

    for (let i = 0; i < count; i++) {
      const newIdx = currentCount + i

      // Clone nodes
      const { clonedNodes: rawCloned, idMapping } = cloneNodesForInstance(
        templateNodes, templateId, newIdx,
      )

      // Translate prompt references
      let clonedNodes = translatePromptRefs(rawCloned, idMapping)

      // Inject seed content if provided
      if (seedContents?.[i] !== undefined) {
        clonedNodes = clonedNodes.map((n) =>
          (n.data?.type === 'seed' || n.data?.isSeed)
            ? { ...n, data: { ...n.data, content: seedContents[i] } }
            : n
        )
      }

      // Clone edges
      const clonedEdges = cloneEdgesForInstance(
        prevEdges, idMapping, templateNodeIds, templateId, newIdx,
      )

      allClonedNodes.push(...clonedNodes)
      allClonedEdges.push(...clonedEdges)

      // Build per-instance data for backend workflow execution
      const iNodeIds = new Set(clonedNodes.map((n) => n.id))

      // Identify external source nodes connected to this instance
      const externalSrcIds = new Set<string>()
      for (const edge of clonedEdges) {
        if (!iNodeIds.has(edge.source)) {
          externalSrcIds.add(edge.source)
        }
      }
      const externalNodes = prevNodes
        .filter((n) => externalSrcIds.has(n.id))
        .map((n) => ({ ...n, data: { ...n.data, _preResolved: true } }))

      const seedNode = clonedNodes.find((n) => n.data?.type === 'seed' || n.data?.isSeed)

      resultInstances.push({
        instanceIdx: newIdx,
        nodes: [...clonedNodes, ...externalNodes],
        edges: clonedEdges,
        seedNodeId: seedNode?.id,
      })
    }

    // Show the last instance
    const lastIdx = currentCount + count - 1

    // Build new nodes in a single state update
    let newNodes = prevNodes.map((n) => {
      if (n.id === templateId) {
        return {
          ...n,
          data: {
            ...n.data,
            instanceCount: currentCount + count,
            currentInstance: lastIdx,
          },
        }
      }
      // Hide all existing template children
      if (n.parentNode === templateId || n.data?.templateId === templateId) {
        return n.hidden ? n : { ...n, hidden: true }
      }
      return n
    })

    // Append cloned nodes — only the last instance is visible
    newNodes = [
      ...newNodes,
      ...allClonedNodes.map((n) => ({
        ...n,
        hidden: n.data?.instanceIdx !== lastIdx,
      })),
    ]

    // Build new edges in a single state update
    let newEdges = prevEdges.map((e) => {
      const eData = e.data as TemplateEdgeData | undefined
      if (eData?.templateId === templateId) {
        return e.hidden ? e : { ...e, hidden: true }
      }
      if (templateNodeIds.has(e.source) || templateNodeIds.has(e.target)) {
        return { ...e, hidden: true, data: { ...(e.data ?? {}), templateId } as TemplateEdgeData }
      }
      return e
    })

    newEdges = [
      ...newEdges,
      ...allClonedEdges.map((e) => ({
        ...e,
        hidden: (e.data as TemplateEdgeData | undefined)?.instanceIdx !== lastIdx,
      })),
    ]

    setNodes(newNodes)
    setEdges(newEdges)

    return { instances: resultInstances }
  }

  /**
   * Switch which instance (or template) is visible for a template.
   * viewIdx: -1 = template, 0+ = instance
   */
  const handleTemplateSwitchView = (templateId: string, viewIdx: number) => {
    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    const withCurrent = prevNodes.map((n) =>
      n.id === templateId ? { ...n, data: { ...n.data, currentInstance: viewIdx } } : n
    )

    const result = applyTemplateVisibility(withCurrent, prevEdges, templateId, viewIdx)
    setNodes(result.nodes)
    setEdges(result.edges)
  }

  /**
   * Delete a specific instance from a template.
   * Removes all cloned nodes/edges with that instanceIdx,
   * then renumbers higher instances down by 1.
   */
  const handleTemplateDeleteInstance = (templateId: string, instanceIdx: number) => {
    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    const templateNode = prevNodes.find((n) => n.id === templateId)
    if (!templateNode) return
    const currentCount = templateNode.data?.instanceCount ?? 0
    if (instanceIdx >= currentCount) return

    // Remove instance nodes
    let updatedNodes = prevNodes.filter((n) => {
      if (n.data?.templateId !== templateId) return true
      return n.data?.instanceIdx !== instanceIdx
    })

    // Renumber instances above the deleted one
    updatedNodes = updatedNodes.map((n) => {
      if (n.data?.templateId !== templateId) return n
      const idx = n.data?.instanceIdx
      if (idx !== undefined && idx > instanceIdx) {
        return { ...n, data: { ...n.data, instanceIdx: idx - 1 } }
      }
      return n
    })

    // Compute new currentInstance
    const newCount = currentCount - 1
    const oldCurrent = templateNode.data?.currentInstance ?? -1
    let newCurrent: number
    if (newCount === 0) {
      newCurrent = -1
    } else if (oldCurrent >= newCount) {
      newCurrent = newCount - 1
    } else if (oldCurrent === instanceIdx) {
      newCurrent = Math.min(instanceIdx, newCount - 1)
    } else if (oldCurrent > instanceIdx) {
      newCurrent = oldCurrent - 1
    } else {
      newCurrent = oldCurrent
    }

    updatedNodes = updatedNodes.map((n) => {
      if (n.id === templateId) {
        return { ...n, data: { ...n.data, instanceCount: newCount, currentInstance: newCurrent } }
      }
      return n
    })

    // Remove + renumber instance edges
    let updatedEdges = prevEdges.filter((e) => {
      const eData = e.data as TemplateEdgeData | undefined
      if (eData?.templateId !== templateId) return true
      return eData?.instanceIdx !== instanceIdx
    })
    updatedEdges = updatedEdges.map((e) => {
      const eData = e.data as TemplateEdgeData | undefined
      if (eData?.templateId !== templateId) return e
      const idx = eData?.instanceIdx
      if (idx !== undefined && idx > instanceIdx) {
        return { ...e, data: { ...e.data, instanceIdx: idx - 1 } }
      }
      return e
    })

    const result = applyTemplateVisibility(updatedNodes, updatedEdges, templateId, newCurrent)
    setNodes(result.nodes)
    setEdges(result.edges)
  }

  /**
   * Release a template: dissolve the container, returning template children
   * to the canvas as top-level nodes with absolute positions.
   * All instance clones and the seed node are deleted.
   */
  const handleTemplateRelease = (templateId: string) => {
    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    const templateNode = prevNodes.find((n) => n.id === templateId)
    if (!templateNode) return

    const templatePos = templateNode.position

    const idsToDelete = new Set<string>([templateId])
    const templateChildIds = new Set<string>()

    for (const n of prevNodes) {
      if (n.parentNode !== templateId && n.data?.templateId !== templateId) continue
      if (n.data?.isSeed) {
        idsToDelete.add(n.id)
        continue
      }
      if (n.data?.instanceIdx !== undefined) {
        idsToDelete.add(n.id)
        continue
      }
      templateChildIds.add(n.id)
    }

    const newNodes = prevNodes
      .filter((n) => !idsToDelete.has(n.id))
      .map((n) => {
        if (!templateChildIds.has(n.id)) return n
        const released = {
          ...n,
          position: {
            x: n.position.x + templatePos.x,
            y: n.position.y + templatePos.y,
          },
          data: {
            ...n.data,
            templateId: undefined,
            templateNodeId: undefined,
            isEditing: false,
          },
          hidden: false,
        }
        delete (released as Record<string, unknown>).parentNode
        delete (released as Record<string, unknown>).extent
        return released
      })

    const newEdges = prevEdges
      .filter((e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target))
      .filter((e) => {
        const eData = e.data as TemplateEdgeData | undefined
        if (eData?.templateId === templateId && eData?.instanceIdx !== undefined) return false
        return true
      })
      .map((e) => {
        const eData = e.data as TemplateEdgeData | undefined
        if (eData?.templateId !== templateId) return e
        const { templateId: _l, templateEdgeId: _t, instanceIdx: _i, ...cleanData } = eData as Record<string, unknown>
        return { ...e, hidden: false, data: Object.keys(cleanData).length > 0 ? cleanData : undefined }
      })

    setNodes(newNodes)
    setEdges(newEdges)
  }

  return {
    handleTemplateAddInstance,
    handleTemplateAddInstances,
    handleTemplateSwitchView,
    handleTemplateDeleteInstance,
    handleTemplateRelease,

    // Helper functions (exported for testing or advanced use)
    collectTemplateTree,
    cloneNodesForInstance,
    cloneEdgesForInstance,
    applyTemplateVisibility,
  }
}

export type TemplateManager = ReturnType<typeof useTemplateManager>
