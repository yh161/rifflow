"use client"

import React, { memo, useState, useEffect, useRef } from 'react'
import { NodeProps, useStore } from 'reactflow'
import { cn } from '@/lib/utils'
import { Image as ImageIcon } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { GenerateImagePanel } from '@/components/layout/node_editor/_panels'

export const meta = {
  id: 'image',
  name: 'Image',
  description: 'Visual assets & diagrams',
  icon: ImageIcon,
  color: 'text-emerald-500',
  bg: 'bg-emerald-50',
  border: 'hover:border-emerald-200',
  opensEditor: true,
  panelTitle: 'Generate Image',
}

export const defaultData: Partial<CustomNodeData> = {
  type: 'image',
  label: 'New Image',
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
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const displayW = data.width  ?? 180
  const displayH = data.height ?? 180

  // Subscribe to canvas zoom directly — re-renders when zoom changes
  const zoom = useStore((s) => s.transform[2])

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

  return (
    <div
      className={cn(
        'overflow-hidden',
        'bg-white/70 border border-slate-300/60',
        'transition-all duration-200',
        selected && 'ring-2 ring-blue-300 ring-offset-1 border-blue-200',
      )}
      style={{
        width:  displayW,
        height: displayH,
        borderRadius: data.isEditing ? '0px' : '12px',
        transition: 'border-radius 300ms cubic-bezier(0.4,0,0.2,1), box-shadow 200ms',
      }}
    >
      {(displaySrc ?? data.src)
        ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displaySrc ?? data.src}
            alt={data.fileName || 'image'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )
        : (
          <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center gap-1.5">
            <span className="text-[10px] text-slate-300">Double-click to edit</span>
          </div>
        )
      }
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
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