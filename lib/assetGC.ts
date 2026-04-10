/**
 * Asset Garbage Collector — shared utility (server-only).
 *
 * Extracts all MinIO object keys that are actively referenced by a user's
 * canvas (RiffDraft.nodesJson) and every undo snapshot
 * (RiffDraftSnapshot.nodesJson).  Any key present in MinIO but absent from
 * this set is an "orphan" that can be safely deleted.
 *
 * Usage on the server:
 *   import { extractAllReferencedKeys } from "@/lib/assetGC"
 *   const live = await extractAllReferencedKeys(nodesJson, snapshots)
 *   // compare with minioClient.listObjects(bucket, `${userId}/`, true)
 */

import { extractStorageObjectKey } from "@/lib/asset-ref"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface NodeData {
  src?:        string
  videoSrc?:   string
  videoPoster?: string
  mediaFiles?: Array<{ src?: string }>
  [key: string]: unknown
}

interface AnyNode {
  data?: NodeData
  [key: string]: unknown
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Convert a full MinIO URL to the raw object key (e.g. "userId/uuid.png"),
 * or return null if the URL doesn't belong to our MinIO bucket.
 */
export function urlToMinioKey(url: unknown): string | null {
  return extractStorageObjectKey(url)
}

/**
 * Scan a list of nodes and return every MinIO key that is referenced
 * in any asset field (src, videoSrc, videoPoster, mediaFiles[].src).
 */
export function extractKeysFromNodes(nodes: AnyNode[]): Set<string> {
  const keys = new Set<string>()

  for (const node of nodes) {
    const d = node.data
    if (!d) continue

    for (const val of [d.src, d.videoSrc, d.videoPoster]) {
      const key = urlToMinioKey(val)
      if (key) keys.add(key)
    }

    if (Array.isArray(d.mediaFiles)) {
      for (const mf of d.mediaFiles) {
        const key = urlToMinioKey(mf?.src)
        if (key) keys.add(key)
      }
    }
  }

  return keys
}

/**
 * Aggregate all referenced MinIO keys across:
 *   - the current draft canvas
 *   - every undo snapshot
 *
 * Returns the full "live" key set.  Anything NOT in this set is an orphan.
 */
export function extractAllReferencedKeys(
  draftNodes: AnyNode[],
  snapshots:  Array<{ nodesJson: unknown }>,
): Set<string> {
  const keys = extractKeysFromNodes(draftNodes)

  for (const snap of snapshots) {
    const snapNodes = Array.isArray(snap.nodesJson) ? (snap.nodesJson as AnyNode[]) : []
    for (const k of extractKeysFromNodes(snapNodes)) {
      keys.add(k)
    }
  }

  return keys
}
