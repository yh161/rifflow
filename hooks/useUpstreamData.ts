"use client"

import { useState, useEffect } from "react"
import { useNodes, useEdges } from "reactflow"
import type { CustomNodeData } from "@/components/layout/modules/_types"

export interface UpstreamNodeData {
  id: string
  type: string
  label?: string
  // Node content
  content?: string    // Text node content
  src?: string        // Image/video URL (base64 for blob/local URLs)
  videoSrc?: string   // Video URL
}

/**
 * Convert blob URL to base64 data URL
 */
async function blobUrlToBase64(blobUrl: string): Promise<string | null> {
  try {
    const response = await fetch(blobUrl)
    if (!response.ok) return null

    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.warn("[blobUrlToBase64] Failed to convert:", blobUrl, err)
    return null
  }
}

/**
 * Check if URL is a blob URL
 */
function isBlobUrl(url: string): boolean {
  return url.startsWith("blob:")
}

/**
 * Check if URL is a local/private address
 */
function isLocalUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname === "minio" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return true
    }
    
    return false
  } catch {
    return true
  }
}

/**
 * Get upstream node raw data (not compressed thumbnails)
 * Used for resolving {{nodeId}} references in prompts
 * Automatically converts blob/local URLs to base64
 */
export function useUpstreamData(nodeId: string): UpstreamNodeData[] {
  const nodes = useNodes()
  const edges = useEdges()
  const [upstreamData, setUpstreamData] = useState<UpstreamNodeData[]>([])

  useEffect(() => {
    // Find edges where target is this node
    const incomingEdges = edges.filter((e) => e.target === nodeId)
    
    // Get unique source node IDs
    const sourceIds = [...new Set(incomingEdges.map((e) => e.source))]
    
    // Build upstream data list with base64 conversion
    async function buildUpstreamData() {
      const result: UpstreamNodeData[] = []
      
      for (const sourceId of sourceIds) {
        const node = nodes.find((n) => n.id === sourceId)
        if (!node) continue
        
        const data = node.data as CustomNodeData
        let src = data.src
        
        // Convert blob/local URLs to base64
        if (src && (isBlobUrl(src) || isLocalUrl(src))) {
          const base64 = await blobUrlToBase64(src)
          if (base64) {
            src = base64
          }
        }
        
        result.push({
          id: node.id,
          type: data.type || 'text',
          label: data.label,
          content: data.content,
          src,
          videoSrc: data.videoSrc,
        })
      }
      
      setUpstreamData(result)
    }
    
    buildUpstreamData()
  }, [nodeId, nodes, edges])

  return upstreamData
}
