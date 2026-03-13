"use client"

import { Node, Edge } from "reactflow"
import type { LoopEdgeData } from "@/components/layout/modules/_types"
import { CanvasState } from "./useCanvasState"

/**
 * Loop instance management logic extracted from canvas.tsx
 * Handles all loop-related operations: adding instances, switching views, deleting instances, releasing loops
 */
export function useLoopManager(canvasState: CanvasState) {
  const { nodesRef, edgesRef, setNodes, setEdges } = canvasState

  // ─────────────────────────────────────────────
  // Loop helper functions (extracted from canvas.tsx)
  // ─────────────────────────────────────────────

  const generateId = (prefix: string) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  }

  /**
   * Recursively collect template children of a loop node.
   * For nested loops, this also collects the inner loop's template children
   * so that when the outer loop is cloned, everything inside is duplicated.
   */
  const collectTemplateTree = (loopId: string, allNodes: Node[]) => {
    const directChildren = allNodes.filter(
      (n) => n.parentNode === loopId && n.data?.instanceIdx === undefined
    )
    const result: Node[] = [...directChildren]
    // Recurse into nested container nodes (Batch or Cycle)
    for (const child of directChildren) {
      if (child.type === 'BatchNode' || child.type === 'CycleNode') {
        result.push(...collectTemplateTree(child.id, allNodes))
      }
    }
    return result
  }

  /**
   * Clone a set of template nodes for a new instance.
   * Returns { clonedNodes, idMapping } where idMapping maps old→new IDs.
   * Handles nested loops: inner loop nodes get new IDs and their children
   * are re-parented accordingly.
   */
  const cloneNodesForInstance = (
    templateNodes: Node[],
    outerLoopId: string,
    instanceIdx: number,
  ): { clonedNodes: Node[]; idMapping: Map<string, string> } => {
    const idMapping = new Map<string, string>()

    // Pre-generate new IDs for all template nodes
    for (const n of templateNodes) {
      idMapping.set(n.id, generateId(n.data?.type ?? 'clone'))
    }

    const clonedNodes: Node[] = templateNodes.map((n) => {
      const newId = idMapping.get(n.id)!
      // Determine the new parentNode: if the node's parent is being cloned too, use the clone's ID.
      // Otherwise keep the original parent (which is the outerLoopId for direct children).
      const newParent = n.parentNode ? (idMapping.get(n.parentNode) ?? n.parentNode) : n.parentNode

      // Determine loopId for this clone:
      // Direct children of outerLoopId → loopId = outerLoopId
      // Nested children (inside an inner loop) → loopId = that inner loop's *original* id
      // (they'll be re-keyed when the inner loop itself manages instances)
      const effectiveLoopId = n.parentNode === outerLoopId ? outerLoopId : n.data?.loopId ?? outerLoopId

      return {
        ...n,
        id: newId,
        parentNode: newParent,
        data: {
          ...n.data,
          loopId: effectiveLoopId,
          instanceIdx: n.parentNode === outerLoopId ? instanceIdx : n.data?.instanceIdx,
          templateNodeId: n.id,
          // Clear runtime-injected callbacks — they'll be re-injected if the clone is ever edited
          onDataChange: undefined,
          onDelete: undefined,
          isEditing: false,
        },
        // For nested loop children that are NOT direct children of outerLoop,
        // we don't set instanceIdx on them — their own inner loop manages that.
        // But they still need to be hidden/shown with the outer instance.
        hidden: true, // newly created instances start hidden; switchView will show them
        selected: false,
      }
    })

    // Fix: For nodes nested inside an inner loop (not direct children of outerLoop),
    // we mark them with the outer loop's instance info so they can be hidden together.
    // We use a separate field to avoid conflicting with the inner loop's own instance management.
    for (const clone of clonedNodes) {
      if (clone.parentNode !== outerLoopId) {
        // This is a nested node — belongs to an inner loop that was itself cloned.
        // Set loopId to outerLoopId and instanceIdx so visibility toggling works.
        clone.data = {
          ...clone.data,
          loopId: outerLoopId,
          instanceIdx: instanceIdx,
        }
      }
    }

    return { clonedNodes, idMapping }
  }

  /**
   * Clone edges that connect to template children.
   * Catches ALL edge types:
   *  - Internal (both ends are template children)
   *  - External-in (source outside loop, target is template child)
   *  - External-out (source is template child, target outside loop)
   *  - Untagged edges (no loopId metadata — regular user-drawn edges)
   *  - Tagged template edges (loopId set, no instanceIdx)
   *
   * Skips edges that already belong to another instance (instanceIdx defined).
   */
  const cloneEdgesForInstance = (
    allEdges: Edge[],
    idMapping: Map<string, string>,
    templateNodeIds: Set<string>,
    outerLoopId: string,
    instanceIdx: number,
  ): Edge[] => {
    const clonedEdges: Edge[] = []

    for (const edge of allEdges) {
      // Skip edges that are instance clones (they have instanceIdx)
      if ((edge.data as LoopEdgeData | undefined)?.instanceIdx !== undefined) continue

      const srcIsTemplate = templateNodeIds.has(edge.source)
      const tgtIsTemplate = templateNodeIds.has(edge.target)

      // Only clone edges that touch at least one template child
      if (!srcIsTemplate && !tgtIsTemplate) continue

      const newEdge: Edge = {
        ...edge,
        id: generateId('edge'),
        source: srcIsTemplate ? (idMapping.get(edge.source) ?? edge.source) : edge.source,
        target: tgtIsTemplate ? (idMapping.get(edge.target) ?? edge.target) : edge.target,
        data: {
          ...(edge.data ?? {}),
          loopId: outerLoopId,
          instanceIdx: instanceIdx,
          templateEdgeId: edge.id,
        } as LoopEdgeData,
        hidden: true,
        selected: false,
      }
      clonedEdges.push(newEdge)
    }

    return clonedEdges
  }

  /**
   * Apply visibility: show template OR a specific instance for a given loop.
   * viewIdx: -1 = show template, 0+ = show that instance
   */
  const applyLoopVisibility = (
    nodes: Node[],
    edges: Edge[],
    loopId: string,
    viewIdx: number,
  ): { nodes: Node[]; edges: Edge[] } => {
    // Build set of visible node IDs for edge visibility
    const visibleNodeIds = new Set<string>()

    const updatedNodes = nodes.map((n) => {
      // Only touch nodes that are children of this loop
      if (n.parentNode !== loopId && n.data?.loopId !== loopId) {
        if (!n.hidden) visibleNodeIds.add(n.id)
        return n
      }

      const nodeInstIdx = n.data?.instanceIdx

      let shouldShow: boolean
      if (viewIdx === -1) {
        // Template view: show template nodes (no instanceIdx), hide all instances
        shouldShow = nodeInstIdx === undefined
      } else {
        // Instance view: show only nodes with matching instanceIdx
        shouldShow = nodeInstIdx === viewIdx
      }

      if (shouldShow) visibleNodeIds.add(n.id)
      if (n.hidden === !shouldShow) return n // no change
      return { ...n, hidden: !shouldShow }
    })

    // Also add all non-loop nodes to visible set
    for (const n of updatedNodes) {
      if (!n.hidden) visibleNodeIds.add(n.id)
    }

    const updatedEdges = edges.map((e) => {
      const edgeLoopId = (e.data as LoopEdgeData | undefined)?.loopId
      const edgeInstIdx = (e.data as LoopEdgeData | undefined)?.instanceIdx

      // For edges with loopId matching: apply same logic as nodes
      if (edgeLoopId === loopId) {
        let shouldShow: boolean
        if (viewIdx === -1) {
          shouldShow = edgeInstIdx === undefined
        } else {
          shouldShow = edgeInstIdx === viewIdx
        }
        if (e.hidden === !shouldShow) return e
        return { ...e, hidden: !shouldShow }
      }

      // For edges without loopId: check if both endpoints are visible
      const bothVisible = visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      // Template edges touching loop children: mark them with loopId for future
      const srcNode = updatedNodes.find((n) => n.id === e.source)
      const tgtNode = updatedNodes.find((n) => n.id === e.target)
      const srcIsLoopChild = srcNode?.parentNode === loopId && srcNode?.data?.instanceIdx === undefined
      const tgtIsLoopChild = tgtNode?.parentNode === loopId && tgtNode?.data?.instanceIdx === undefined

      if (srcIsLoopChild || tgtIsLoopChild) {
        // This is a template edge that was created while editing the loop's template.
        // Mark it with loopId so future clones pick it up correctly.
        const shouldShow = viewIdx === -1 ? bothVisible : false
        if (e.hidden === !shouldShow && e.data?.loopId === loopId) return e
        return {
          ...e,
          hidden: !shouldShow,
          data: { ...(e.data ?? {}), loopId } as LoopEdgeData,
        }
      }

      // Regular edge: show if both endpoints visible
      if (e.hidden === !bothVisible) return e
      return { ...e, hidden: !bothVisible }
    })

    return { nodes: updatedNodes, edges: updatedEdges }
  }

  // ─────────────────────────────────────────────
  // Loop instance management operations
  // ─────────────────────────────────────────────

  /**
   * Add a new instance to a loop: clone all template children + their edges,
   * then immediately switch view to the new instance.
   */
  const handleLoopAddInstance = (loopId: string) => {
    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    const loopNode = prevNodes.find((n) => n.id === loopId)
    if (!loopNode) return

    const currentCount = loopNode.data?.instanceCount ?? 0
    const newIdx = currentCount

    const templateNodes = collectTemplateTree(loopId, prevNodes)
    if (templateNodes.length === 0) return

    const { clonedNodes, idMapping } = cloneNodesForInstance(templateNodes, loopId, newIdx)
    const templateNodeIds = new Set(templateNodes.map((n) => n.id))
    const clonedEdges = cloneEdgesForInstance(prevEdges, idMapping, templateNodeIds, loopId, newIdx)

    // ── Build new nodes ──
    let newNodes = prevNodes.map((n) => {
      if (n.id === loopId) {
        return { ...n, data: { ...n.data, instanceCount: currentCount + 1, currentInstance: newIdx } }
      }
      if (n.parentNode === loopId || n.data?.loopId === loopId) {
        return n.hidden ? n : { ...n, hidden: true }
      }
      return n
    })
    newNodes = [...newNodes, ...clonedNodes.map((n) => ({ ...n, hidden: false }))]

    // ── Build new edges ──
    let newEdges = prevEdges.map((e) => {
      const eData = e.data as LoopEdgeData | undefined
      if (eData?.loopId === loopId) {
        return e.hidden ? e : { ...e, hidden: true }
      }
      if (templateNodeIds.has(e.source) || templateNodeIds.has(e.target)) {
        return { ...e, hidden: true, data: { ...(e.data ?? {}), loopId } as LoopEdgeData }
      }
      return e
    })
    newEdges = [...newEdges, ...clonedEdges.map((e) => ({ ...e, hidden: false }))]

    setNodes(newNodes)
    setEdges(newEdges)
  }

  /**
   * Switch which instance (or template) is visible for a loop.
   * viewIdx: -1 = template, 0+ = instance
   */
  const handleLoopSwitchView = (loopId: string, viewIdx: number) => {
    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    // Update the loop node's currentInstance
    const withCurrent = prevNodes.map((n) =>
      n.id === loopId ? { ...n, data: { ...n.data, currentInstance: viewIdx } } : n
    )

    const result = applyLoopVisibility(withCurrent, prevEdges, loopId, viewIdx)
    setNodes(result.nodes)
    setEdges(result.edges)
  }

  /**
   * Delete a specific instance from a loop.
   * Removes all cloned nodes/edges with that instanceIdx,
   * then renumbers higher instances down by 1.
   */
  const handleLoopDeleteInstance = (loopId: string, instanceIdx: number) => {
    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    const loopNode = prevNodes.find((n) => n.id === loopId)
    if (!loopNode) return
    const currentCount = loopNode.data?.instanceCount ?? 0
    if (instanceIdx >= currentCount) return

    // Remove instance nodes
    let updatedNodes = prevNodes.filter((n) => {
      if (n.data?.loopId !== loopId) return true
      return n.data?.instanceIdx !== instanceIdx
    })

    // Renumber instances above the deleted one
    updatedNodes = updatedNodes.map((n) => {
      if (n.data?.loopId !== loopId) return n
      const idx = n.data?.instanceIdx
      if (idx !== undefined && idx > instanceIdx) {
        return { ...n, data: { ...n.data, instanceIdx: idx - 1 } }
      }
      return n
    })

    // Compute new currentInstance
    const newCount = currentCount - 1
    const oldCurrent = loopNode.data?.currentInstance ?? -1
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
      if (n.id === loopId) {
        return { ...n, data: { ...n.data, instanceCount: newCount, currentInstance: newCurrent } }
      }
      return n
    })

    // Remove + renumber instance edges
    let updatedEdges = prevEdges.filter((e) => {
      const eData = e.data as LoopEdgeData | undefined
      if (eData?.loopId !== loopId) return true
      return eData?.instanceIdx !== instanceIdx
    })
    updatedEdges = updatedEdges.map((e) => {
      const eData = e.data as LoopEdgeData | undefined
      if (eData?.loopId !== loopId) return e
      const idx = eData?.instanceIdx
      if (idx !== undefined && idx > instanceIdx) {
        return { ...e, data: { ...e.data, instanceIdx: idx - 1 } }
      }
      return e
    })

    // Apply visibility
    const result = applyLoopVisibility(updatedNodes, updatedEdges, loopId, newCurrent)
    setNodes(result.nodes)
    setEdges(result.edges)
  }

  /**
   * Release a loop: dissolve the container, returning template children
   * to the canvas as top-level nodes with absolute positions.
   * All instance clones and the seed node are deleted.
   */
  const handleLoopRelease = (loopId: string) => {
    const prevNodes = nodesRef.current
    const prevEdges = edgesRef.current

    const loopNode = prevNodes.find((n) => n.id === loopId)
    if (!loopNode) return

    const loopPos = loopNode.position

    // Collect IDs to delete: loop itself, seed, all instance clones
    const idsToDelete = new Set<string>([loopId])

    // Template child IDs — these survive but get released
    const templateChildIds = new Set<string>()

    for (const n of prevNodes) {
      if (n.parentNode !== loopId && n.data?.loopId !== loopId) continue

      // Seed node → delete
      if (n.data?.isSeed) {
        idsToDelete.add(n.id)
        continue
      }

      // Instance clone (has instanceIdx) → delete
      if (n.data?.instanceIdx !== undefined) {
        idsToDelete.add(n.id)
        continue
      }

      // Template child → release
      templateChildIds.add(n.id)
    }

    // Build new nodes
    const newNodes = prevNodes
      .filter((n) => !idsToDelete.has(n.id))
      .map((n) => {
        if (!templateChildIds.has(n.id)) return n
        // Convert relative position → absolute, fully detach from parent.
        // Must delete parentNode/extent keys — setting to undefined still
        // leaves the key present, which ReactFlow interprets as "has parent".
        const released = {
          ...n,
          position: {
            x: n.position.x + loopPos.x,
            y: n.position.y + loopPos.y,
          },
          data: {
            ...n.data,
            loopId: undefined,
            templateNodeId: undefined,
            isEditing: false,
          },
          hidden: false,
        }
        delete (released as any).parentNode
        delete (released as any).extent
        return released
      })

    // Build new edges: remove instance edges, clean loopId tags from template edges
    const newEdges = prevEdges
      .filter((e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target))
      .filter((e) => {
        const eData = e.data as LoopEdgeData | undefined
        // Remove instance clone edges
        if (eData?.loopId === loopId && eData?.instanceIdx !== undefined) return false
        return true
      })
      .map((e) => {
        const eData = e.data as LoopEdgeData | undefined
        if (eData?.loopId !== loopId) return e
        // Strip loop metadata from surviving template edges
        const { loopId: _l, templateEdgeId: _t, instanceIdx: _i, ...cleanData } = eData as any
        return { ...e, hidden: false, data: Object.keys(cleanData).length > 0 ? cleanData : undefined }
      })

    setNodes(newNodes)
    setEdges(newEdges)
  }

  return {
    // Loop instance operations
    handleLoopAddInstance,
    handleLoopSwitchView,
    handleLoopDeleteInstance,
    handleLoopRelease,
    
    // Helper functions (exported for testing or advanced use)
    collectTemplateTree,
    cloneNodesForInstance,
    cloneEdgesForInstance,
    applyLoopVisibility,
  }
}

export type LoopManager = ReturnType<typeof useLoopManager>