"use client"

import React, { memo, useRef, useState, useCallback } from 'react'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import { Video as VideoIcon, Play, Pause } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'
import { GenerateVideoPanel } from '@/components/layout/node_editor/_panels'

export const meta = {
  id: 'video',
  name: 'Video',
  description: 'Generated & uploaded video clips',
  icon: VideoIcon,
  color: 'text-violet-500',
  bg: 'bg-violet-50',
  border: 'hover:border-violet-200',
  opensEditor: true,
  panelTitle: 'Generate Video',
}

export const defaultData: Partial<CustomNodeData> = {
  type: 'video',
  label: 'New Video',
}

export const handles: HandleDef[] = [
  { id: 'in', side: 'left'  },
  { id: 'out', side: 'right' },
]

export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState(false)

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else          { v.pause(); setPlaying(false) }
  }, [])

  return (
    <div
      className={cn(
        'overflow-hidden relative select-none',
        'bg-white/70 border border-slate-300/60',
        'transition-all duration-200',
        selected && 'ring-2 ring-violet-300 ring-offset-1 border-violet-200',
      )}
      style={{
        width:        data.width  ?? 180,
        height:       data.height ?? 180,
        borderRadius: data.isEditing ? '0px' : '12px',
        transition:   'border-radius 300ms cubic-bezier(0.4,0,0.2,1), box-shadow 200ms',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {data.videoSrc ? (
        <>
          <video
            ref={videoRef}
            src={data.videoSrc}
            className="w-full h-full object-cover"
            loop
            playsInline
            onEnded={() => setPlaying(false)}
            onMouseDown={(e) => e.stopPropagation()}
          />

          {/* Play / Pause overlay */}
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center',
              'transition-opacity duration-200 cursor-pointer',
              hovered || !playing ? 'opacity-100' : 'opacity-0',
            )}
            onClick={togglePlay}
          >
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center',
                'bg-black/30 backdrop-blur-sm',
                'transition-transform duration-150',
                hovered && 'scale-110',
              )}
            >
              {playing
                ? <Pause size={14} className="text-white fill-white" />
                : <Play  size={14} className="text-white fill-white ml-0.5" />
              }
            </div>
          </div>

          {/* Duration badge */}
          {data.videoDuration && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/40 backdrop-blur-sm pointer-events-none">
              <span className="text-[10px] font-medium text-white tabular-nums">
                {data.videoDuration}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full bg-violet-50/60 flex flex-col items-center justify-center gap-2">
          <VideoIcon size={24} className="text-violet-200" />
          <span className="text-[10px] text-slate-300">Double-click to edit</span>
        </div>
      )}
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'VideoNode'

export function ModalContent({ data, onUpdate, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <GenerateVideoPanel
      data={data as CustomNodeData}
      onDataChange={onUpdate as (u: Partial<CustomNodeData>) => void}
      hasSrc={!!(data as CustomNodeData).videoSrc}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
    />
  )
}
