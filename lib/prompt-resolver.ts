import type { UpstreamNodeData } from "@/hooks/useUpstreamData"

// ─────────────────────────────────────────────
// Multimodal Content Types
// ─────────────────────────────────────────────

export interface TextContent {
  type: "text"
  text: string
}

export interface ImageContent {
  type: "image_url"
  image_url: {
    url: string
    detail?: "low" | "high" | "auto"
  }
}

export type MultimodalContent = TextContent | ImageContent

/**
 * Check if URL is a local/private address that remote LLM cannot access
 */
function isLocalUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    
    // Standard local addresses
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.")
    ) {
      return true
    }
    
    // Docker internal hostnames (container names, docker hosts)
    if (
      hostname === "minio" ||
      hostname === "host.docker.internal" ||
      hostname === "docker.for.mac.localhost" ||
      hostname === "docker.for.win.localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return true
    }
    
    // Protocol-relative URLs or missing protocol (likely relative/local)
    if (!urlObj.protocol || urlObj.protocol === "file:") {
      return true
    }
    
    return false
  } catch {
    // If URL parsing fails, assume it's a relative/local path
    return true
  }
}

/**
 * Check if URL is a blob URL (browser-only, not accessible by LLM)
 */
function isBlobUrl(url: string): boolean {
  return url.startsWith("blob:")
}

/**
 * Fetch image and convert to base64 data URL
 */
async function imageToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.warn("[imageToBase64] Failed to convert:", url, err)
    return null
  }
}

/**
 * Resolve a node to multimodal content
 * - text/gate/seed: returns TextContent
 * - image: returns ImageContent (base64 if local)
 * - video: returns TextContent with URL
 */
async function resolveNodeToContent(
  node: UpstreamNodeData
): Promise<MultimodalContent[]> {
  switch (node.type) {
    case "text":
    case "filter":
    case "seed":
      return node.content
        ? [{ type: "text", text: node.content }]
        : []

    case "image": {
      if (!node.src) return []

      // Blob URL or Local URL: convert to base64 (LLM cannot access these)
      if (isBlobUrl(node.src) || isLocalUrl(node.src)) {
        const base64 = await imageToBase64(node.src)
        if (base64) {
          return [{
            type: "image_url",
            image_url: { url: base64, detail: "auto" }
          }]
        }
        // Fallback: return as text if conversion fails
        return [{
          type: "text",
          text: `[Image: ${node.src}]`
        }]
      }

      // Public URL: return as-is
      return [{
        type: "image_url",
        image_url: { url: node.src, detail: "auto" }
      }]
    }

    case "video": {
      if (!node.videoSrc) return []

      // Video: return as text since most LLMs don't support video
      return [{
        type: "text",
        text: `[Video: ${node.videoSrc}]`
      }]
    }

    case "pdf": {
      if (node.pdfOutputImages && node.pdfOutputImages.length > 0) {
        return node.pdfOutputImages.map((url) => ({
          type: "image_url",
          image_url: { url, detail: "auto" },
        }))
      }

      return node.content
        ? [{ type: "text", text: node.content }]
        : []
    }

    default:
      return node.content
        ? [{ type: "text", text: node.content }]
        : []
  }
}

/**
 * Parse prompt and resolve {{nodeId}} references to multimodal content
 * Returns array of content blocks for OpenAI/Gemini API
 */
export async function resolvePromptToMultimodal(
  prompt: string,
  upstreamData: UpstreamNodeData[]
): Promise<MultimodalContent[]> {
  const nodeMap = new Map(upstreamData.map((n) => [n.id, n]))
  const result: MultimodalContent[] = []

  // Find all {{nodeId}} references
  const regex = /\{\{([^}]+)\}\}/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(prompt)) !== null) {
    const nodeId = match[1].trim()
    const node = nodeMap.get(nodeId)

    // Add text before the reference
    if (match.index > lastIndex) {
      const textBefore = prompt.slice(lastIndex, match.index).trim()
      if (textBefore) {
        result.push({ type: "text", text: textBefore })
      }
    }

    // Resolve and add the node content
    if (node) {
      const blocks = await resolveNodeToContent(node)
      if (blocks.length > 0) {
        result.push(...blocks)
      }
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text after last reference
  if (lastIndex < prompt.length) {
    const textAfter = prompt.slice(lastIndex).trim()
    if (textAfter) {
      result.push({ type: "text", text: textAfter })
    }
  }

  // If no references found, return the whole prompt as single text block
  if (result.length === 0) {
    return [{ type: "text", text: prompt }]
  }

  return result
}

/**
 * Legacy: Resolve prompt to string (for backward compatibility)
 */
export async function resolvePrompt(
  prompt: string,
  upstreamData: UpstreamNodeData[]
): Promise<{ resolvedPrompt: string }> {
  const contents = await resolvePromptToMultimodal(prompt, upstreamData)

  // Convert multimodal content back to string for legacy APIs
  const resolvedPrompt = contents
    .map((c) => {
      if (c.type === "text") return c.text
      if (c.type === "image_url") return c.image_url.url
      return ""
    })
    .join(" ")

  return { resolvedPrompt }
}

/**
 * Quick check if prompt contains any unresolved references
 */
export function hasReferences(prompt: string): boolean {
  return /\{\{[^}]+\}\}/.test(prompt)
}
