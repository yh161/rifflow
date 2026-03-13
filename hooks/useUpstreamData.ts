"use client"

import { useMemo } from "react"
import { useNodes, useEdges } from "reactflow"
import type { CustomNodeData } from "@/components/layout/modules/_types"

export interface UpstreamNodeData {
  id: string
  type: string
  label?: string
  // Node content
  content?: string    // Text node content
  src?: string        // Image/video URL
  videoSrc?: string   // Video URL
}

/**
 * Get upstream node raw data (not compressed thumbnails)
 * Used for resolving {{nodeId}} references in prompts
 */
export function useUpstreamData(nodeId: string): UpstreamNodeData[] {
  const nodes = useNodes()
  const edges = useEdges()

  return useMemo(() => {
    // Find edges where target is this node
    const incomingEdges = edges.filter((e) => e.target === nodeId)
    
    // Get unique source node IDs
    const sourceIds = [...new Set(incomingEdges.map((e) => e.source))]
    
    // Build upstream data list
    const result: UpstreamNodeData[] = []
    
    for (const sourceId of sourceIds) {
      const node = nodes.find((n) => n.id === sourceId)
      if (!node) continue
      
      const data = node.data as CustomNodeData
      
      result.push({
        id: node.id,
        type: data.type || 'text',
        label: data.label,
        content: data.content,
        src: data.src,
        videoSrc: data.videoSrc,
      })
    }
    
    return result
  }, [nodeId, nodes, edges])
}
