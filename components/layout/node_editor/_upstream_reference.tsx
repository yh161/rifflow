"use client"

import React, { useMemo, useState, useEffect, useCallback } from "react"
import { useReactFlow, type Node, type Edge } from "reactflow"
import { cn } from "@/lib/utils"
import { getThumbnail, getTypeColor } from "@/lib/image-compress"
import type { CustomNodeData } from "../modules/_types"
import { MODULE_BY_ID } from "../modules/_registry"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface UpstreamNode {
  id: string
  type: 'text' | 'image' | 'video' | 'gate' | 'batch' | 'cycle' | 'seed'
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

export function useUpstreamNodes(nodeId: string): UpstreamNode[] {
  const { getNodes, getEdges } = useReactFlow()
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  
  // Get fresh nodes and edges from ReactFlow instance
  const nodes = getNodes()
  const edges = getEdges()

  // Find upstream nodes (nodes that connect TO this node)
  const upstreamList = useMemo((): UpstreamNodeInternal[] => {
    if (!nodeId) return []
    
    // Find edges where target is this node
    const incomingEdges = edges.filter((e) => e.target === nodeId)
    
    // Get unique source node IDs
    const sourceIds = [...new Set(incomingEdges.map((e) => e.source))]
    
    // Find source nodes and build upstream list
    const result: UpstreamNodeInternal[] = []
    
    for (const sourceId of sourceIds) {
      const node = nodes.find((n) => n.id === sourceId)
      if (!node) continue
      
      const data = node.data as CustomNodeData
      const nodeType = data.type || 'text'
      
      // Determine if this node has meaningful output
      const hasOutput = !!(
        data.src ||           // Image node with image
        data.videoSrc ||      // Video node with video
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
    
    return result
  }, [nodeId, nodes, edges])

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
  onInsertReference?: (ref: string) => void
  className?: string
}

export function UpstreamReference({
  nodeId,
  onInsertReference,
  className,
}: UpstreamReferenceProps) {
  const upstreamNodes = useUpstreamNodes(nodeId)

  // No upstream nodes → don't render
  if (upstreamNodes.length === 0) return null

  const handleNodeClick = (node: UpstreamNode) => {
    // Insert reference syntax at cursor or append
    const ref = `{{${node.id}}}`
    onInsertReference?.(ref)
  }

  return (
    <div className={cn("flex items-center gap-1.5 px-3 pt-2.5", className)}>
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
        Ref
      </span>
      <div className="flex items-center gap-1">
        {upstreamNodes.map((node) => (
          <button
            key={node.id}
            onClick={() => handleNodeClick(node)}
            className={cn(
              "relative group",
              "w-7 h-7 rounded-md overflow-hidden",
              "border border-slate-200/80",
              "transition-all duration-150",
              "hover:ring-2 hover:ring-blue-200 hover:border-blue-300",
              "active:scale-95"
            )}
            title={`Insert reference to ${node.label || node.type}`}
          >
            {node.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={node.thumbnail}
                alt={node.label || node.type}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: getTypeColor(node.type) + "20" }}
              >
                {(() => {
                  const Icon = MODULE_BY_ID[node.type]?.meta.icon
                  if (!Icon) return null
                  return (
                    <Icon
                      size={12}
                      style={{ color: getTypeColor(node.type) }}
                    />
                  )
                })()}
              </div>
            )}
            {/* Hover tooltip */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-800 text-white text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {node.label || node.type}
            </div>
          </button>
        ))}
      </div>
      <span className="text-[9px] text-slate-300 ml-1">
        Click to insert
      </span>
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
