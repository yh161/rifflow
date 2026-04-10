import { STORAGE_BUCKET, STORAGE_PUBLIC_BASE } from "@/lib/storage"

const PUBLIC_BASE_WITH_SLASH = `${STORAGE_PUBLIC_BASE}/`

function isEphemeralUrl(value: string): boolean {
  return value.startsWith("blob:") || value.startsWith("data:")
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://")
}

function isLikelyObjectKey(value: string): boolean {
  // e.g. userId/uuid.pdf
  if (!value.includes("/")) return false
  if (value.startsWith("/")) return false
  if (value.includes("://")) return false
  return true
}

/**
 * Extract stable object key from either:
 * - key itself: userId/uuid.ext
 * - public url: https://.../<bucket>/userId/uuid.ext
 */
export function extractStorageObjectKey(input: unknown): string | null {
  if (typeof input !== "string") return null
  const value = input.trim()
  if (!value || isEphemeralUrl(value)) return null

  // already a key
  if (!isHttpUrl(value) && isLikelyObjectKey(value)) return value

  // current configured public base
  if (value.startsWith(PUBLIC_BASE_WITH_SLASH)) {
    return value.slice(PUBLIC_BASE_WITH_SLASH.length)
  }

  try {
    const url = new URL(value)
    const path = decodeURIComponent(url.pathname)

    // https://storage.googleapis.com/<bucket>/<key>
    const bucketPrefix = `/${STORAGE_BUCKET}/`
    if (path.startsWith(bucketPrefix)) {
      return path.slice(bucketPrefix.length)
    }

    // https://<bucket>.storage.googleapis.com/<key>
    if (url.hostname === `${STORAGE_BUCKET}.storage.googleapis.com`) {
      const key = path.startsWith("/") ? path.slice(1) : path
      return key || null
    }
  } catch {
    return null
  }

  return null
}

export function toStoragePublicUrl(key: string): string {
  return `${STORAGE_PUBLIC_BASE}/${key}`
}
