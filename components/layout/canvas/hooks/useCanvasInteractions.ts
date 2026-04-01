"use client"

import { useCallback, useRef } from "react"
import type { Node } from "reactflow"
import type { CanvasState } from "./useCanvasState"

interface UseCanvasInteractionsParams {
  canvasState: CanvasState
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }
}

/**
 * Encapsulates drag-related canvas interaction policies:
 * - child eject from container
 * - external node adoption into container
 * - hover/eject tension visual flags
 */
export function useCanvasInteractions({
  canvasState,
  screenToFlowPosition,
}: UseCanvasInteractionsParams) {
  const EJECT_THRESHOLD_PX = 80

  const dragHoverContainerIdRef = useRef<string | null>(null)
  const dragEjectStateRef = useRef<{
    ejecting: boolean
    ready: boolean
    containerId: string | null
  }>({ ejecting: false, ready: false, containerId: null })
  const dragPointerOffsetRef = useRef<{ nodeId: string; dx: number; dy: number } | null>(null)

  const getNodeSize = useCallback((n: Node, fallbackW: number, fallbackH: number) => {
    const w = (n.style?.width as number | undefined) ?? (n.data?.width as number | undefined) ?? fallbackW
    const h = (n.style?.height as number | undefined) ?? (n.data?.height as number | undefined) ?? fallbackH
    return { w, h }
  }, [])

  const getChildAbsoluteBounds = useCallback((child: Node, parent: Node) => {
    const { w: nW, h: nH } = getNodeSize(child, 180, 180)
    const left = parent.position.x + child.position.x
    const top = parent.position.y + child.position.y
    return {
      left,
      top,
      right: left + nW,
      bottom: top + nH,
      width: nW,
      height: nH,
    }
  }, [getNodeSize])

  const getContainerBounds = useCallback((container: Node) => {
    const { w: pW, h: pH } = getNodeSize(container, 520, 400)
    return {
      left: container.position.x,
      top: container.position.y,
      right: container.position.x + pW,
      bottom: container.position.y + pH,
      width: pW,
      height: pH,
    }
  }, [getNodeSize])

  const ejectFromParent = useCallback((
    nodeId: string,
    desiredFlowPos: { x: number; y: number },
  ) => {
    canvasState.setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n
      const rest = { ...(n as Record<string, unknown>) }
      delete rest.parentNode
      delete rest.extent
      return {
        ...rest,
        position: desiredFlowPos,
        data: {
          ...(n.data as object),
          templateId:     undefined,
          instanceIdx:    undefined,
          templateNodeId: undefined,
        },
      } as Node
    }))

    canvasState.setEdges(es => es.map(e => {
      if (e.source !== nodeId && e.target !== nodeId) return e
      const eData = e.data as Record<string, unknown> | undefined
      if (!eData?.templateId) return e
      const clean = { ...eData }
      delete clean.templateId
      delete clean.templateEdgeId
      delete clean.instanceIdx
      return { ...e, hidden: false, data: Object.keys(clean).length ? clean : undefined }
    }))
  }, [canvasState])

  const adoptIntoContainer = useCallback((nodeId: string, containerId: string) => {
    canvasState.setNodes(nds => {
      const container = nds.find(n => n.id === containerId)
      if (!container) return nds
      const currentInstance = container.data?.currentInstance ?? -1
      const instanceStamp = currentInstance >= 0
        ? { instanceIdx: currentInstance as number }
        : {}

      return nds.map(n => {
        if (n.id !== nodeId) return n
        if (n.parentNode) return n
        return {
          ...n,
          parentNode: containerId,
          extent: 'parent' as const,
          position: {
            x: n.position.x - container.position.x,
            y: n.position.y - container.position.y,
          },
          data: { ...n.data, templateId: containerId, ...instanceStamp },
        }
      })
    })
  }, [canvasState])

  const handleNodeDrag = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.parentNode) {
      if (
        node.type === 'TemplateNode' || node.type === 'LassoNode' ||
        node.data?.isSeed || node.data?.isLocked
      ) return

      const allNodes = canvasState.nodesRef.current
      const parent = allNodes.find(n => n.id === node.parentNode)
      if (!parent) return

      const currentZoom  = canvasState.viewportRef.current.zoom
      const flowMousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY })

      const childBounds = getChildAbsoluteBounds(node, parent)
      const parentBounds = getContainerBounds(parent)
      const pointerOffset =
        dragPointerOffsetRef.current?.nodeId === node.id
          ? dragPointerOffsetRef.current
          : (() => {
              const next = {
                nodeId: node.id,
                dx: flowMousePos.x - childBounds.left,
                dy: flowMousePos.y - childBounds.top,
              }
              dragPointerOffsetRef.current = next
              return next
            })()

      const desiredLeft = flowMousePos.x - pointerOffset.dx
      const desiredTop = flowMousePos.y - pointerOffset.dy
      const desiredRight = desiredLeft + childBounds.width
      const desiredBottom = desiredTop + childBounds.height
      const isPointerOutsideParent =
        flowMousePos.x < parentBounds.left ||
        flowMousePos.x > parentBounds.right ||
        flowMousePos.y < parentBounds.top ||
        flowMousePos.y > parentBounds.bottom

      const overshoot = Math.max(
        0,
        parentBounds.left - desiredLeft,
        desiredRight - parentBounds.right,
        parentBounds.top - desiredTop,
        desiredBottom - parentBounds.bottom,
      )

      const isDragEjecting      = isPointerOutsideParent && overshoot > 0
      const isDragEjectingReady = isPointerOutsideParent && overshoot > EJECT_THRESHOLD_PX / currentZoom

      const prev = dragEjectStateRef.current
      const changed =
        prev.ejecting !== isDragEjecting ||
        prev.ready    !== isDragEjectingReady ||
        prev.containerId !== node.parentNode

      if (changed) {
        const prevId = prev.containerId
        dragEjectStateRef.current = {
          ejecting: isDragEjecting,
          ready: isDragEjectingReady,
          containerId: node.parentNode,
        }
        canvasState.setNodes(nds => nds.map(n => {
          if (n.id === node.parentNode) {
            return { ...n, data: { ...n.data, isDragEjecting, isDragEjectingReady } }
          }
          if (prevId && n.id === prevId && prevId !== node.parentNode) {
            return { ...n, data: { ...n.data, isDragEjecting: false, isDragEjectingReady: false } }
          }
          return n
        }))
      }
      return
    }

    dragPointerOffsetRef.current = null

    if (
      node.type === 'TemplateNode' || node.type === 'LassoNode' ||
      node.data?.isSeed || node.data?.isLocked
    ) {
      if (dragHoverContainerIdRef.current) {
        const prev = dragHoverContainerIdRef.current
        dragHoverContainerIdRef.current = null
        canvasState.setNodes(nds => nds.map(n =>
          n.id === prev ? { ...n, data: { ...n.data, isDragHovered: false } } : n
        ))
      }
      return
    }

    const allNodes = canvasState.nodesRef.current
    const flowMousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY })

    let newHovered: string | null = null
    for (const c of allNodes) {
      if (c.type !== 'TemplateNode' && c.type !== 'LassoNode') continue
      const cW = (c.style?.width  as number | undefined) ?? (c.data?.width  as number | undefined) ?? 520
      const cH = (c.style?.height as number | undefined) ?? (c.data?.height as number | undefined) ?? 400
      const pointerInside =
        flowMousePos.x >= c.position.x && flowMousePos.x <= c.position.x + cW &&
        flowMousePos.y >= c.position.y && flowMousePos.y <= c.position.y + cH
      if (pointerInside) { newHovered = c.id; break }
    }

    if (newHovered !== dragHoverContainerIdRef.current) {
      const prev = dragHoverContainerIdRef.current
      dragHoverContainerIdRef.current = newHovered
      canvasState.setNodes(nds => nds.map(n => {
        if (n.id === newHovered) return { ...n, data: { ...n.data, isDragHovered: true  } }
        if (n.id === prev)       return { ...n, data: { ...n.data, isDragHovered: false } }
        return n
      }))
    }
  }, [canvasState, getChildAbsoluteBounds, getContainerBounds, screenToFlowPosition])

  const handleNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    if (dragHoverContainerIdRef.current) {
      const prev = dragHoverContainerIdRef.current
      dragHoverContainerIdRef.current = null
      canvasState.setNodes(nds => nds.map(n =>
        n.id === prev ? { ...n, data: { ...n.data, isDragHovered: false } } : n
      ))
    }

    if (dragEjectStateRef.current.containerId) {
      const prevId = dragEjectStateRef.current.containerId
      dragEjectStateRef.current = { ejecting: false, ready: false, containerId: null }
      canvasState.setNodes(nds => nds.map(n =>
        n.id === prevId
          ? { ...n, data: { ...n.data, isDragEjecting: false, isDragEjectingReady: false } }
          : n
      ))
    }

    if (node.data?.isSeed || node.data?.isLocked) return

    const allNodes     = canvasState.nodesRef.current
    const zoom         = canvasState.viewportRef.current.zoom

    if (node.parentNode) {
      const parent = allNodes.find(n => n.id === node.parentNode)
      if (!parent) return

      const flowMousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const childBounds = getChildAbsoluteBounds(node, parent)
      const parentBounds = getContainerBounds(parent)
      const pointerOffset =
        dragPointerOffsetRef.current?.nodeId === node.id
          ? dragPointerOffsetRef.current
          : { nodeId: node.id, dx: childBounds.width / 2, dy: childBounds.height / 2 }

      const desiredLeft = flowMousePos.x - pointerOffset.dx
      const desiredTop = flowMousePos.y - pointerOffset.dy
      const desiredRight = desiredLeft + childBounds.width
      const desiredBottom = desiredTop + childBounds.height
      const isPointerOutsideParent =
        flowMousePos.x < parentBounds.left ||
        flowMousePos.x > parentBounds.right ||
        flowMousePos.y < parentBounds.top ||
        flowMousePos.y > parentBounds.bottom

      const overshoot = Math.max(
        0,
        parentBounds.left - desiredLeft,
        desiredRight - parentBounds.right,
        parentBounds.top - desiredTop,
        desiredBottom - parentBounds.bottom,
      )

      if (isPointerOutsideParent && overshoot > EJECT_THRESHOLD_PX / zoom) {
        ejectFromParent(node.id, {
          x: desiredLeft,
          y: desiredTop,
        })
      }
      dragPointerOffsetRef.current = null
      return
    }

    dragPointerOffsetRef.current = null

    if (node.type === 'TemplateNode' || node.type === 'LassoNode') return

    const flowMousePos = screenToFlowPosition({ x: event.clientX, y: event.clientY })

    for (const c of allNodes) {
      if (c.type !== 'TemplateNode' && c.type !== 'LassoNode') continue
      const cW = (c.style?.width  as number | undefined) ?? (c.data?.width  as number | undefined) ?? 520
      const cH = (c.style?.height as number | undefined) ?? (c.data?.height as number | undefined) ?? 400
      const pointerInside =
        flowMousePos.x >= c.position.x && flowMousePos.x <= c.position.x + cW &&
        flowMousePos.y >= c.position.y && flowMousePos.y <= c.position.y + cH
      if (pointerInside) {
        adoptIntoContainer(node.id, c.id)
        break
      }
    }
  }, [canvasState, ejectFromParent, adoptIntoContainer, getChildAbsoluteBounds, getContainerBounds, screenToFlowPosition])

  return {
    handleNodeDrag,
    handleNodeDragStop,
  }
}
