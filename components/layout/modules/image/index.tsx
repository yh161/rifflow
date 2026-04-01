"use client"

import React, { memo, useState, useEffect, useRef } from 'react'
import { NodeProps, useStore, useReactFlow } from 'reactflow'
import { cn } from '@/lib/utils'
import { Image as ImageIcon } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from '../_types'
import type { HandleDef } from '../_handle'
import { GenerateImagePanel } from '@/components/layout/node_editor/_panels'

export const meta = {
  id: 'image',
  name: 'Image',
  description: 'Visual assets & diagrams',
  icon: ImageIcon,
  color: 'text-blue-400',
  bg: 'bg-blue-50',
  border: 'hover:border-blue-300',
  opensEditor: true,
  panelTitle: 'Generate Image',
  category: 'Assets',
  modelBadge: 'FLUX',
  doneColor: 'rgba(96, 165, 250, 0.55)',
}

export const defaultData: Partial<CustomNodeData> = {
  type: 'image',
  label: 'Image',
}

export const handles: HandleDef[] = [
  { id: 'in',  side: 'left'  },
  { id: 'out', side: 'right' },
]

// ─────────────────────────────────────────────
// Rasterization
// ─────────────────────────────────────────────

async function rasterizeToSize(src: string, targetW: number, targetH: number): Promise<string> {
  const img = new window.Image()
  img.src = src
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej() })
  const canvas = document.createElement('canvas')
  canvas.width  = targetW
  canvas.height = targetH
  canvas.getContext('2d')!.drawImage(img, 0, 0, targetW, targetH)
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(URL.createObjectURL(blob)) : reject(),
      'image/jpeg', 0.92,
    )
  })
}

// ─────────────────────────────────────────────
// NodeUI
// ─────────────────────────────────────────────

export const NodeUI = ({
  data,
  selected,
  nodeId,
}: {
  data: CustomNodeData
  selected?: boolean
  nodeId?: string
}) => {
  const displayW = data.width  ?? 180
  const displayH = data.height ?? 180
  const { setNodes } = useReactFlow()

  // Subscribe to canvas zoom directly — re-renders when zoom changes
  const zoom = useStore((s) => s.transform[2])

  // When src first appears (generation/upload), resize node to natural image dimensions
  const prevSrcRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!data.src || data.src === prevSrcRef.current) return
    if (data.naturalWidth && data.naturalHeight) {
      prevSrcRef.current = data.src
      return // already have dims, no need to reload
    }
    prevSrcRef.current = data.src
    const img = new window.Image()
    img.onload = () => {
      if (!nodeId || !img.naturalWidth || !img.naturalHeight) return
      const BASE = 240
      const iw = img.naturalWidth, ih = img.naturalHeight
      const newW = iw >= ih ? BASE : Math.round(BASE * iw / ih)
      const newH = ih >= iw ? BASE : Math.round(BASE * ih / iw)
      setNodes(ns => ns.map(n => {
        if (n.id !== nodeId) return n
        const oldW = (n.style?.width  as number | undefined) ?? n.data.width  ?? 180
        const oldH = (n.style?.height as number | undefined) ?? n.data.height ?? 180
        return {
          ...n,
          style:    { ...n.style, width: newW, height: newH },
          data:     { ...n.data, naturalWidth: iw, naturalHeight: ih, width: newW, height: newH },
          position: { x: n.position.x + (oldW - newW) / 2, y: n.position.y + (oldH - newH) },
        }
      }))
    }
    img.src = data.src
  }, [data.src, data.naturalWidth, data.naturalHeight, nodeId, setNodes])

  // displaySrc is the rasterized blob for the current zoom.
  // src (original objectURL) is the source of truth and is never touched here.
  const [displaySrc, setDisplaySrc] = useState<string | null>(null)
  const displaySrcRef   = useRef<string | null>(null)
  const lastRasterRef   = useRef<{ src: string; zoom: number } | null>(null)
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!data.src) {
      setDisplaySrc(null)
      return
    }

    // Skip re-raster if zoom change is < 30% and same src
    const last = lastRasterRef.current
    if (last && last.src === data.src) {
      const delta = Math.abs(zoom - last.zoom) / Math.max(last.zoom, 0.001)
      if (delta < 0.3) return
    }

    // Skip when the node is tiny — no visible benefit
    if (displayW * zoom < 30) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const dpr = window.devicePixelRatio || 1
      const targetW = Math.min(
        Math.round(displayW * zoom * dpr),
        data.naturalWidth  ?? 99999,
      )
      const targetH = Math.min(
        Math.round(displayH * zoom * dpr),
        data.naturalHeight ?? 99999,
      )
      try {
        const newBlob = await rasterizeToSize(data.src!, targetW, targetH)
        // Revoke previous display blob (never the original src)
        if (displaySrcRef.current) URL.revokeObjectURL(displaySrcRef.current)
        displaySrcRef.current = newBlob
        lastRasterRef.current = { src: data.src!, zoom }
        setDisplaySrc(newBlob)
      } catch {
        // fallback: show original directly
        setDisplaySrc(data.src ?? null)
      }
    }, 250)
  }, [data.src, zoom, displayW, displayH, data.naturalWidth, data.naturalHeight])

  // Revoke display blob on unmount
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (displaySrcRef.current) URL.revokeObjectURL(displaySrcRef.current)
  }, [])

  const rotation = data.rotation ?? 0
  const normalizedRotation = ((rotation % 360) + 360) % 360
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270

  // Scale-from-bottom-center animation when dimensions change
  const prevSizeRef = useRef({ w: displayW, h: displayH })
  const [initialScale, setInitialScale] = useState<{ sx: number; sy: number } | null>(null)
  useEffect(() => {
    const prev = prevSizeRef.current
    if (prev.w === displayW && prev.h === displayH) return
    const sx = prev.w / displayW
    const sy = prev.h / displayH
    prevSizeRef.current = { w: displayW, h: displayH }
    setInitialScale({ sx, sy })
    requestAnimationFrame(() => requestAnimationFrame(() => setInitialScale(null)))
  }, [displayW, displayH])

  return (
    <div style={{ width: displayW, height: displayH, position: 'relative' }}>
      {/* Scale wrapper: carries the border + animates from bottom-center */}
      <div
        className={cn(
          'overflow-hidden',
          'bg-white/70 border',
          data.mode === 'done' ? 'border-blue-400/70' : 'border-slate-300/60',
          selected && 'ring-2 ring-blue-300 ring-offset-1 border-blue-200',
        )}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: data.isEditing ? '0px' : '12px',
          transform: initialScale
            ? `scaleX(${initialScale.sx}) scaleY(${initialScale.sy})`
            : 'scale(1)',
          transformOrigin: 'bottom center',
          transition: initialScale ? 'none' : 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Inner: counter-scale keeps content visually stable */}
        <div style={{
          width: '100%',
          height: '100%',
          transform: initialScale
            ? `scaleX(${1 / initialScale.sx}) scaleY(${1 / initialScale.sy})`
            : 'scale(1)',
          transformOrigin: 'bottom center',
          transition: initialScale ? 'none' : 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
        }}>
          {(displaySrc ?? data.src)
            ? (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: isQuarterTurn ? `${displayH}px` : '100%',
                    height: isQuarterTurn ? `${displayW}px` : '100%',
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                    transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1), width 300ms cubic-bezier(0.4,0,0.2,1), height 300ms cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displaySrc ?? data.src}
                    alt={data.fileName || 'image'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              </div>
            )
            : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <ImageIcon size={24} className="text-slate-200" />
                <span className="text-[10px] text-slate-300">Double-click to edit</span>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}

export const ReactFlowNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} nodeId={id} />
))
ReactFlowNode.displayName = 'ImageNode'

export function ModalContent({ data, nodeId, onUpdate, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <GenerateImagePanel
      data={data as CustomNodeData}
      nodeId={nodeId}
      onDataChange={onUpdate as (u: Partial<CustomNodeData>) => void}
      hasSrc={!!(data as CustomNodeData).src}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
    />
  )
}
export { resultHandler } from './resultHandler'
export { ActionBarContent } from './actionBar'
