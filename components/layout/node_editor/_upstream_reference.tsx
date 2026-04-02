"use client"

import React, { useMemo, useState, useEffect } from "react"
import { useReactFlow, type Node, type Edge } from "reactflow"
import { cn } from "@/lib/utils"
import { getThumbnail, getNodeThemeColor } from "@/lib/image-compress"
import type { CustomNodeData } from "../modules/_types"
import { MODULE_BY_ID } from "../modules/_registry"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface UpstreamNode {
  id: string
  type: 'text' | 'image' | 'video' | 'pdf' | 'filter' | 'template' | 'seed'
  label?: string
  thumbnail: string | null // Base64 or null
  hasOutput: boolean       // Whether the node has meaningful output
}

interface UpstreamNodeInternal extends UpstreamNode {
  _src?: string
}

// ─────────────────────────────────────────────
// Hook: Get upstream nodes for a given node
// ─────────────────────────────────────────────

export function useUpstreamNodes(nodeId: string, handleId?: string): UpstreamNode[] {
  const { getNodes, getEdges } = useReactFlow()
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  const [upstreamList, setUpstreamList] = useState<UpstreamNodeInternal[]>([])

  // Use effect to avoid infinite re-renders - poll for changes
  useEffect(() => {
    // Function to compute upstream nodes
    const computeUpstream = () => {
      if (!nodeId) {
        setUpstreamList([])
        return
      }

      const nodes = getNodes()
      const edges = getEdges()

      // Find edges where target is this node (optionally filtered by handle)
      const incomingEdges = edges.filter((e: Edge) =>
        e.target === nodeId && (handleId === undefined || e.targetHandle === handleId)
      )
      
      // Get unique source node IDs
      const sourceIds = [...new Set(incomingEdges.map((e: Edge) => e.source))]
      
      // Find source nodes and build upstream list
      const result: UpstreamNodeInternal[] = []
      
      for (const sourceId of sourceIds) {
        const node = nodes.find((n: Node) => n.id === sourceId)
        if (!node) continue
        
        const data = node.data as CustomNodeData
        const nodeType = data.type || 'text'
        
        // Determine if this node has meaningful output
        const hasOutput = !!(
          data.src ||           // Image node with image
          data.videoSrc ||      // Video node with video
          data.pdfSrc ||        // PDF node with document
          data.content ||       // Text node with content
          data.type === 'seed'  // Seed node always has potential output
        )
        
        result.push({
          id: node.id,
          type: nodeType as UpstreamNode['type'],
          label: data.label || nodeType,
          thumbnail: null, // Will be populated async
          hasOutput,
          _src: data.src || data.videoPoster,
        })
      }
      
      setUpstreamList(result)
    }
    
    // Compute immediately
    computeUpstream()
    
    // Set up polling to detect changes
    const interval = setInterval(computeUpstream, 500)

    return () => clearInterval(interval)
  }, [nodeId, handleId, getNodes, getEdges])

  // Async: generate thumbnails for image nodes
  useEffect(() => {
    const abortController = new AbortController()
    
    async function loadThumbnails() {
      const newThumbnails = new Map<string, string>()
      
      for (const upstream of upstreamList) {
        if (abortController.signal.aborted) return
        if (!upstream._src) continue
        
        try {
          const thumb = await getThumbnail(upstream._src, 28)
          if (thumb && !abortController.signal.aborted) {
            newThumbnails.set(upstream.id, thumb)
          }
        } catch (err) {
          // Ignore thumbnail errors
        }
      }
      
      if (!abortController.signal.aborted) {
        setThumbnails(newThumbnails)
      }
    }
    
    loadThumbnails()
    
    return () => abortController.abort()
  }, [upstreamList])

  // Merge thumbnails into upstream list
  return useMemo((): UpstreamNode[] => 
    upstreamList.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      hasOutput: n.hasOutput,
      thumbnail: thumbnails.get(n.id) || null,
    })),
    [upstreamList, thumbnails]
  )
}

// ─────────────────────────────────────────────
// UpstreamReference Component
// ─────────────────────────────────────────────

export interface UpstreamReferenceProps {
  nodeId: string
  handleId?: string
  onInsertReference?: (ref: string) => void
  className?: string
}

export function UpstreamReference({
  nodeId,
  handleId,
  onInsertReference,
  className,
}: UpstreamReferenceProps) {
  const upstreamNodes = useUpstreamNodes(nodeId, handleId)

  // No upstream nodes → don't render
  if (upstreamNodes.length === 0) return null

  const handleNodeClick = (node: UpstreamNode) => {
    // Insert reference syntax at cursor or append
    const ref = `{{${node.id}}}`
    onInsertReference?.(ref)
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1 px-3 pt-2.5", className)}>
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mr-0.5">
        Ref
      </span>
      {upstreamNodes.map((node) => {
        const typeColor = getNodeThemeColor(node.type)
        const Icon = MODULE_BY_ID[node.type]?.meta.icon
        const displayLabel = node.label || node.id.slice(-6)
        return (
          <button
            key={node.id}
            onMouseDown={(e) => { e.preventDefault(); handleNodeClick(node) }}
            title={`Insert {{${node.id}}}`}
            className={cn(
              "flex items-center gap-1",
              "px-1.5 py-0.5 rounded-md",
              "border border-slate-200 bg-white text-slate-600",
              "text-[9px] font-medium",
              "transition-all duration-150",
              "active:scale-95",
            )}
            style={{
              borderColor: `${typeColor}55`,
              backgroundColor: `${typeColor}10`,
              color: typeColor,
            }}
          >
            {node.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={node.thumbnail}
                alt={displayLabel}
                className="w-4 h-4 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: typeColor + "20" }}
              >
                {Icon && <Icon size={10} style={{ color: typeColor }} />}
              </div>
            )}
            <span className="truncate max-w-[60px]">{displayLabel}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// Utility: Parse references from text
// ─────────────────────────────────────────────

/**
 * Find all node references in a text.
 * Returns array of { id, start, end } positions.
 */
export function parseReferences(text: string): { id: string; start: number; end: number }[] {
  const regex = /\{\{([^}]+)\}\}/g
  const refs: { id: string; start: number; end: number }[] = []
  let match
  
  while ((match = regex.exec(text)) !== null) {
    refs.push({
      id: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  
  return refs
}

/**
 * Replace all references in text with resolved values.
 * @param text - Text containing {{nodeId}} references
 * @param resolver - Function to resolve nodeId to its output value
 */
export async function resolveReferences(
  text: string,
  resolver: (nodeId: string) => Promise<string | null>
): Promise<string> {
  const refs = parseReferences(text)
  if (refs.length === 0) return text
  
  // Resolve all references in parallel
  const resolved = await Promise.all(
    refs.map(async (ref) => ({
      ...ref,
      value: await resolver(ref.id),
    }))
  )
  
  // Replace from end to start to preserve positions
  let result = text
  for (let i = resolved.length - 1; i >= 0; i--) {
    const { start, end, value } = resolved[i]
    result = result.slice(0, start) + (value || `{{${refs[i].id}}}`) + result.slice(end)
  }
  
  return result
}
