"use client"

import React, { memo, useState, useRef } from 'react'
import { NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import {
  RotateCcw, Info, Settings2, FileText, RefreshCw, Camera, GitBranch,
  ChevronLeft, ChevronRight, X, Play, Image as ImageIcon,
  Video, Plus, Trash2, Upload, Maximize2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Database } from 'lucide-react'
import type { StandardNodeData, StandardNodeMediaFile, ModuleModalProps } from './_types'
import type { HandleDef } from './_handle'

// ─────────────────────────────────────────────
// Module meta
// ─────────────────────────────────────────────
export const meta = {
  id: 'entity',
  name: 'Entity',
  description: 'KG entity — character, location, event, object',
  icon: Database,
  color: 'text-blue-500',
  bg: 'bg-blue-50',
  border: 'hover:border-blue-200',
  isStandard: true,
}

export const defaultData: Partial<StandardNodeData> = {
  name: 'New Entity',
  subType: 'Character',
  properties: {},
  mediaFiles: [],
}

// KG entity: receives context from above, passes to below
export const handles: HandleDef[] = [
  { id: 'in', side: 'top'    },
  { id: 'out', side: 'bottom' },
]

// ─────────────────────────────────────────────
// Canvas UI
// ─────────────────────────────────────────────
export const StandardNodeUI = ({
  data,
  selected,
}: {
  data: StandardNodeData
  selected?: boolean
}) => (
  <div className="group relative before:absolute before:-inset-12 before:rounded-full before:content-[''] before:z-[-11]">
    <div className={cn(
      'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 z-10 relative',
      'bg-white border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]',
      'group-hover:scale-110 group-hover:shadow-[0_0_25px_rgba(59,130,246,0.4)]',
      selected ? 'border-blue-600 ring-4 ring-blue-100' : '',
    )}>
      <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center">
        <span className="text-blue-600 font-bold text-sm">
          {data.name?.charAt(0).toUpperCase() || 'E'}
        </span>
      </div>
    </div>

    <div className="absolute left-12 top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none transition-all group-hover:left-14">
      <div className="text-[13px] font-bold text-slate-800 leading-none mb-0.5">
        {data.name || 'Unnamed Entity'}
      </div>
      <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
        {data.subType || 'Entity'}
      </div>
    </div>

    {/* Hover action buttons */}
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <button
        onClick={(e) => { e.stopPropagation(); data.onRefresh?.() }}
        className={cn(
          'absolute w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded-full shadow-lg',
          'text-slate-500 hover:text-blue-600 hover:border-blue-300 pointer-events-auto',
          'opacity-0 scale-50 transition-all duration-300 ease-out -z-10',
          'group-hover:opacity-100 group-hover:scale-100 group-hover:-translate-x-10 group-hover:-translate-y-4',
          '[.is-ghost_&]:hidden',
        )}
      >
        <RotateCcw size={12} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); data.onDetail?.() }}
        className={cn(
          'absolute w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded-full shadow-lg',
          'text-slate-500 hover:text-blue-600 hover:border-blue-300 pointer-events-auto',
          'opacity-0 scale-50 transition-all duration-300 ease-out -z-10 delay-75',
          'group-hover:opacity-100 group-hover:scale-100 group-hover:-translate-x-10 group-hover:translate-y-4',
          '[.is-ghost_&]:hidden',
        )}
      >
        <Info size={12} />
      </button>
    </div>
  </div>
)

// Alias — registry expects NodeUI
export const NodeUI = StandardNodeUI

// ─────────────────────────────────────────────
// Media Lightbox
// ─────────────────────────────────────────────
function MediaLightbox({
  files, index, onClose,
}: {
  files: StandardNodeMediaFile[]
  index: number
  onClose: () => void
}) {
  const [current, setCurrent] = useState(index)
  const file = files[current]

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={onClose}>
        <X size={28} />
      </button>

      {files.length > 1 && (
        <>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"
            onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c - 1 + files.length) % files.length) }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"
            onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c + 1) % files.length) }}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <div
        className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {file.type === 'image' ? (
          <img src={file.src} alt={file.fileName} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
        ) : (
          <video src={file.src} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
        )}
        <p className="text-white/50 text-xs">{file.fileName} · {current + 1} / {files.length}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Modal editor
// ─────────────────────────────────────────────
export function ModalContent({ data, onUpdate, onConfirm, onClose, onDelete }: ModuleModalProps) {
  const stdData = data as StandardNodeData
  const [mediaIndex, setMediaIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mediaFiles: StandardNodeMediaFile[] = stdData.mediaFiles || []
  const properties: Record<string, string | number | boolean> = stdData.properties || {}

  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const updateProperty = (key: string, value: string) =>
    onUpdate({ properties: { ...properties, [key]: value } })

  const addProperty = () => {
    if (!newKey.trim()) return
    onUpdate({ properties: { ...properties, [newKey.trim()]: newVal } })
    setNewKey(''); setNewVal('')
  }

  const removeProperty = (key: string) => {
    const next = { ...properties }
    delete next[key]
    onUpdate({ properties: next })
  }

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const newMedia: StandardNodeMediaFile[] = files.map((file) => ({
      fileName: file.name,
      src: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
      rawFile: file,
    }))
    const combined = [...mediaFiles, ...newMedia]
    onUpdate({ mediaFiles: combined })
    setMediaIndex(combined.length - 1)
    e.target.value = ''
  }

  const removeMedia = (idx: number) => {
    const next = mediaFiles.filter((_, i) => i !== idx)
    onUpdate({ mediaFiles: next })
    setMediaIndex(Math.max(0, idx - 1))
  }

  const currentMedia = mediaFiles[mediaIndex]

  return (
    <div className="flex flex-col -mx-6 -mt-4 mb-[-24px]">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-200/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Database className="text-white w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">
              {stdData.name || '未命名实体'}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border-none">
                {stdData.subType || 'Entity'}
              </Badge>
              <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Graph Entity
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100/50 p-1 rounded-2xl border border-slate-200/50">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl hover:bg-white hover:text-blue-600 transition-all text-slate-500">
                  <RefreshCw size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">同步云端数据</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl hover:bg-white hover:text-purple-600 transition-all text-slate-500">
                  <GitBranch size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">基于此实体新建分支</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-5 bg-slate-50/30 overflow-y-auto max-h-[calc(90vh-200px)]">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">实体名称</Label>
            <Input
              value={stdData.name || ''}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="h-9 text-sm font-medium"
              placeholder="e.g. Jon Snow"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">实体类型</Label>
            <Input
              value={stdData.subType || ''}
              onChange={(e) => onUpdate({ subType: e.target.value })}
              className="h-9 text-sm font-medium"
              placeholder="Character / Location / Event..."
            />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4" style={{ minHeight: 200 }}>
          {/* Media panel */}
          <div className="col-span-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ImageIcon size={11} />
                参考媒体 ({mediaFiles.length})
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] font-bold text-blue-500 hover:text-blue-700 flex items-center gap-0.5 transition-colors"
              >
                <Plus size={11} />上传
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={handleMediaUpload}
              />
            </div>

            <div className="flex-1 relative bg-slate-100 flex items-center justify-center min-h-0 group/media">
              {currentMedia ? (
                <>
                  {currentMedia.type === 'image' ? (
                    <img src={currentMedia.src} alt={currentMedia.fileName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900">
                      <Video size={32} className="text-white/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover/media:opacity-100 transition-opacity bg-black/20">
                    <button onClick={() => setLightboxIndex(mediaIndex)} className="bg-black/60 text-white rounded-full p-2 hover:bg-black/80 transition-all">
                      <Maximize2 size={14} />
                    </button>
                    <button onClick={() => removeMedia(mediaIndex)} className="bg-red-500/80 text-white rounded-full p-2 hover:bg-red-600 transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {mediaFiles.length > 1 && (
                    <>
                      <button onClick={() => setMediaIndex((i) => (i - 1 + mediaFiles.length) % mediaFiles.length)} className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-0.5 hover:bg-black/60">
                        <ChevronLeft size={16} />
                      </button>
                      <button onClick={() => setMediaIndex((i) => (i + 1) % mediaFiles.length)} className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-0.5 hover:bg-black/60">
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 text-slate-300 hover:text-blue-400 transition-colors p-6">
                  <Upload size={28} strokeWidth={1.5} />
                  <span className="text-[10px] font-medium">上传参考图片或视频</span>
                </button>
              )}
            </div>

            {mediaFiles.length > 1 && (
              <div className="flex gap-1 px-2 py-2 bg-slate-50 border-t border-slate-100 overflow-x-auto shrink-0">
                {mediaFiles.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => setMediaIndex(i)}
                    className={cn(
                      'w-8 h-8 rounded flex-shrink-0 overflow-hidden border-2 transition-all',
                      i === mediaIndex ? 'border-blue-500' : 'border-transparent opacity-60 hover:opacity-100',
                    )}
                  >
                    {f.type === 'image' ? (
                      <img src={f.src} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                        <Play size={8} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {currentMedia && (
              <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 shrink-0">
                <p className="text-[9px] text-slate-400 truncate">{currentMedia.fileName}</p>
              </div>
            )}
          </div>

          {/* Properties panel */}
          <div className="col-span-7 rounded-2xl bg-white/70 border border-white shadow-sm backdrop-blur-sm flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 shrink-0 flex items-center gap-2">
              <FileText size={12} className="text-blue-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                属性 / Properties
              </span>
              <Badge className="ml-auto text-[9px] bg-slate-100 text-slate-500 border-none">Neo4j</Badge>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-50">
              {Object.entries(properties).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 px-3 py-1.5 group/row hover:bg-slate-50/80">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 w-20 shrink-0 truncate">{key}</span>
                  <Input
                    value={String(val)}
                    onChange={(e) => updateProperty(key, e.target.value)}
                    className="h-6 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 font-medium text-slate-700"
                  />
                  <button onClick={() => removeProperty(key)} className="opacity-0 group-hover/row:opacity-100 text-red-400 hover:text-red-600 shrink-0 transition-all">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/40">
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addProperty()}
                  placeholder="key"
                  className="h-6 text-xs w-20 shrink-0 bg-white border-slate-200"
                />
                <Input
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addProperty()}
                  placeholder="value..."
                  className="h-6 text-xs flex-1 bg-white border-slate-200"
                />
                <button onClick={addProperty} className="shrink-0 text-blue-500 hover:text-blue-700">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 text-[10px] text-slate-400">
          <div className="flex flex-col">
            <span className="font-bold text-slate-500">STORAGE</span>
            <span>Local · Canvas Pack</span>
          </div>
          <div className="w-px h-6 bg-slate-100" />
          <div className="flex flex-col">
            <span className="font-bold text-slate-500">MEDIA</span>
            <span>{mediaFiles.length} file(s)</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onDelete && (
            <Button variant="ghost" className="text-red-500 text-xs font-semibold hover:text-red-600 hover:bg-red-50" onClick={onDelete}>
              <Trash2 size={14} className="mr-1" />Delete
            </Button>
          )}
          <Button variant="ghost" className="text-slate-400 text-xs font-semibold hover:text-slate-600" onClick={onClose}>
            取消
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 h-10 font-bold text-xs shadow-lg shadow-blue-100 flex items-center gap-2"
            onClick={() => { onConfirm ? onConfirm() : onClose() }}
          >
            <Camera size={14} />
            确认创建实体
          </Button>
        </div>
      </div>

      {lightboxIndex !== null && (
        <MediaLightbox files={mediaFiles} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  )
}