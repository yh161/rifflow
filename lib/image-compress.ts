/**
 * Image compression utilities for generating tiny thumbnails.
 * Used for upstream node references in the editor panel.
 */

/**
 * Compress an image source to a tiny thumbnail base64.
 * @param src - Image source (URL, blob URL, or data URL)
 * @param size - Target size (width = height)
 * @param quality - JPEG quality (0-1)
 * @returns Base64 data URL (e.g., "data:image/jpeg;base64,...")
 */
export async function compressToThumbnail(
  src: string,
  size: number = 28,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          reject(new Error("Failed to get canvas context"))
          return
        }
        
        // Calculate crop dimensions for center-square crop
        const minDim = Math.min(img.naturalWidth, img.naturalHeight)
        const sx = (img.naturalWidth - minDim) / 2
        const sy = (img.naturalHeight - minDim) / 2
        
        // Draw center-cropped and scaled
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)
        
        // Convert to base64
        const dataUrl = canvas.toDataURL("image/jpeg", quality)
        resolve(dataUrl)
      } catch (err) {
        reject(err)
      }
    }
    
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/**
 * Cache for compressed thumbnails to avoid recompression.
 */
const thumbnailCache = new Map<string, { url: string; timestamp: number }>()
const CACHE_TTL = 60_000 // 1 minute

/**
 * Get a compressed thumbnail with caching.
 * @param src - Original image source
 * @param size - Target thumbnail size
 * @returns Compressed thumbnail base64, or null if compression fails
 */
export async function getThumbnail(src: string, size: number = 28): Promise<string | null> {
  const cacheKey = `${src}:${size}`
  
  // Check cache
  const cached = thumbnailCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url
  }
  
  try {
    const compressed = await compressToThumbnail(src, size)
    thumbnailCache.set(cacheKey, { url: compressed, timestamp: Date.now() })
    return compressed
  } catch (err) {
    console.warn("[getThumbnail] Failed to compress:", err)
    return null
  }
}

/**
 * Generate a placeholder color based on node type.
 * Used when no image is available.
 */
export function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    text: "#3b82f6",   // blue
    image: "#10b981",  // emerald
    video: "#8b5cf6",  // violet
    pdf: "#f43f5e",    // rose
    gate: "#f59e0b",   // amber
    template: "#6366f1",  // indigo
    seed: "#64748b",   // slate
  }
  return colors[type] || "#94a3b8"
}

/**
 * Node theme color used by editor chips (matches module theme, not source type color)
 */
export function getNodeThemeColor(type: string): string {
  const colors: Record<string, string> = {
    text: "#3b82f6",     // blue-500
    image: "#60a5fa",    // blue-400
    video: "#8b5cf6",    // violet-500
    pdf: "#f43f5e",      // rose-500
    filter: "#f59e0b",   // amber-500
    template: "#6366f1", // indigo-500
    seed: "#a78bfa",     // violet-400
    lasso: "#94a3b8",    // slate-400
  }
  return colors[type] || "#94a3b8"
}