"use client"

/**
 * ConsoleNodePanel — Embedded node editor panel for the console.
 * 
 * Renders the module's ModalContent component for manual nodes,
 * allowing users to edit prompt, model, params, upload/download assets
 * directly within the console. Reads and writes canvas node data via
 * useReactFlow().
 */

import React, { useCallback, useRef, useState } from "react"
import { useReactFlow, useNodes } from "reactflow"
import { cn } from "@/lib/utils"
import { Play, SkipForward, Upload, Download, ChevronDown, ChevronUp } from "lucide-react"
import type { CustomNodeData, NodeMode, AnyNodeData } from "../modules/_types"
import { MODULE_BY_ID } from "../modules/_registry"

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface ConsoleNodePanelProps {
  nodeId: string
  /** Called when user triggers generation for this node */
  onGenerate: (nodeId: string) => void
  /** Called when user wants to skip / continue without generating */
  onContinue: (nodeId: string) => void
  /** Whether the node is currently generating */
  isGenerating?: boolean
}

// ─────────────────────────────────────────────
// ConsoleNodePanel
// ─────────────────────────────────────────────
export function ConsoleNodePanel({
  nodeId,
  onGenerate,
  onContinue,
  isGenerating = false,
}: ConsoleNodePanelProps) {
  const { setNodes, getNodes, getEdges } = useReactFlow()
  const nodes = useNodes()
  const node = nodes.find((n) => n.id === nodeId)
  const data = node?.data as CustomNodeData | undefined
  const [collapsed, setCollapsed] = useState(false)

  // File input refs for upload
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // ── Update handler — writes to canvas ──
  const handleUpdate = useCallback(
    (updates: Partial<CustomNodeData>) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n
          const next = { ...n, data: { ...n.data, ...updates } }
          if (updates.width !== undefined || updates.height !== undefined) {
            const oldW = (n.style?.width as number | undefined) ?? n.data.width ?? 180
            const oldH = (n.style?.height as number | undefined) ?? n.data.height ?? 180
            const newW = updates.width ?? oldW
            const newH = updates.height ?? oldH
            next.style = { ...n.style, width: newW, height: newH }
            next.position = {
              x: n.position.x + (oldW - newW) / 2,
              y: n.position.y + (oldH - newH),
            }
          }
          return next
        }),
      )
    },
    [nodeId, setNodes],
  )

  // ── Upload handlers ──
  const handleUploadImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return
      const tempSrc = URL.createObjectURL(file)
      const img = new window.Image()
      img.onload = async () => {
        const minSide = Math.min(img.naturalWidth, img.naturalHeight)
        const scale = 180 / minSide
        handleUpdate({
          src: tempSrc,
          fileName: file.name,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          width: Math.round(img.naturalWidth * scale),
          height: Math.round(img.naturalHeight * scale),
        })
        try {
          const form = new FormData()
          form.append("file", file)
          const res = await fetch("/api/upload", { method: "POST", body: form })
          const json = (await res.json()) as { url?: string; objectKey?: string }
          if (res.ok && json.objectKey) {
            handleUpdate({ src: json.objectKey })
            URL.revokeObjectURL(tempSrc)
          }
        } catch {}
      }
      img.src = tempSrc
    },
    [handleUpdate],
  )

  const handleUploadVideo = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) return
      const tempSrc = URL.createObjectURL(file)
      handleUpdate({ videoSrc: tempSrc, fileName: file.name })
      try {
        const form = new FormData()
        form.append("file", file)
        const res = await fetch("/api/upload", { method: "POST", body: form })
        const json = (await res.json()) as { url?: string; objectKey?: string }
        if (res.ok && json.objectKey) {
          handleUpdate({ videoSrc: json.objectKey })
          URL.revokeObjectURL(tempSrc)
        }
      } catch {}
    },
    [handleUpdate],
  )

  const handleUploadPdf = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") return
      const tempSrc = URL.createObjectURL(file)
      handleUpdate({ pdfSrc: tempSrc, fileName: file.name, pdfCurrentPage: 1 })
      try {
        const form = new FormData()
        form.append("file", file)
        const res = await fetch("/api/upload", { method: "POST", body: form })
        const json = (await res.json()) as { url?: string; objectKey?: string }
        if (res.ok && json.objectKey) {
          handleUpdate({ pdfSrc: json.objectKey })
          URL.revokeObjectURL(tempSrc)
        }
      } catch {}
    },
    [handleUpdate],
  )

  // ── Download handler ──
  const handleDownload = useCallback(() => {
    const href =
      data?.type === "video"
        ? data.videoSrc
        : data?.type === "pdf"
          ? data.pdfSrc
          : data?.src
    if (!href) return
    const a = document.createElement("a")
    a.href = href
    a.download = data?.fileName || "download"
    a.click()
  }, [data])

  // ── Generation handler — delegates to parent ──
  const handleGenerate = useCallback(() => {
    onGenerate(nodeId)
  }, [nodeId, onGenerate])

  if (!node || !data) return null

  const mod = MODULE_BY_ID[data.type]
  const ModalContent = mod?.ModalContent
  const hasAsset = !!(data.src || data.videoSrc || data.pdfSrc)
  const nodeType = data.type

  // Determine upload type for this node
  const acceptUpload =
    nodeType === "image" ? "image/*" :
    nodeType === "video" ? "video/*" :
    nodeType === "pdf" ? ".pdf" : null

  const uploadRef =
    nodeType === "image" ? imageInputRef :
    nodeType === "video" ? videoInputRef :
    nodeType === "pdf" ? pdfInputRef : null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (nodeType === "image") handleUploadImage(file)
    else if (nodeType === "video") handleUploadVideo(file)
    else if (nodeType === "pdf") handleUploadPdf(file)
    e.target.value = ""
  }

  return (
    <div className="flex flex-col">
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 hover:bg-slate-50 transition-colors"
      >
        <span>Node Editor</span>
        {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {!collapsed && (
        <>
          {/* Asset buttons */}
          {acceptUpload && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100">
              <button
                onClick={() => uploadRef?.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <Upload size={11} /> Upload
              </button>
              {hasAsset && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <Download size={11} /> Download
                </button>
              )}
              <input
                ref={uploadRef}
                type="file"
                accept={acceptUpload}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Module ModalContent — reuses the exact same panel component */}
          {ModalContent && (
            <div className="console-modal-content">
              <ModalContent
                data={data as AnyNodeData}
                nodeId={nodeId}
                onUpdate={handleUpdate as (updates: Partial<AnyNodeData>) => void}
                onClose={() => {}}
                mode={(((data.mode as string | undefined) === "done" ? "note" : data.mode) as NodeMode) ?? "manual"}
                isGenerating={isGenerating}
                onGenerate={(prompt, model, params) => {
                  // Save prompt/model/params to node, then trigger execution
                  handleUpdate({ prompt, model, params })
                  handleGenerate()
                }}
                onStop={() => {
                  setNodes((ns) =>
                    ns.map((n) =>
                      n.id !== nodeId
                        ? n
                        : {
                            ...n,
                            data: {
                              ...n.data,
                              isGenerating: false,
                              activeJobId: undefined,
                              generationProgress: 0,
                              generationStatusText: "",
                            },
                          },
                    ),
                  )
                }}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !data.prompt?.trim()}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200",
                isGenerating
                  ? "bg-blue-50 text-blue-400 cursor-wait"
                  : data.prompt?.trim()
                    ? "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] shadow-sm"
                    : "bg-slate-100 text-slate-300 cursor-not-allowed",
              )}
            >
              <Play size={12} />
              {isGenerating ? "Generating..." : "Run Node"}
            </button>
            <button
              onClick={() => onContinue(nodeId)}
              disabled={isGenerating}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200",
                isGenerating
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-500 hover:bg-slate-100 border border-slate-200",
              )}
            >
              <SkipForward size={12} />
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  )
}
