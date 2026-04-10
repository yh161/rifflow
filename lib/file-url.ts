/**
 * lib/file-url.ts
 * Client-safe helper to resolve a storage value to a full URL.
 *
 * Values stored in node data can be:
 *   - object key:  "userId/uuid.png"          ← new format (stable)
 *   - full URL:    "https://old.domain/..."   ← old format (backward compat)
 *   - blob URL:    "blob:..."                 ← temporary, session-only
 *   - data URL:    "data:..."                 ← inline
 *
 * Call resolveFileUrl(v) before rendering any asset URL.
 */

const STORAGE_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_STORAGE_URL) || ''

export function resolveFileUrl(v: string | undefined | null): string {
  if (!v) return ''
  if (
    v.startsWith('http://') ||
    v.startsWith('https://') ||
    v.startsWith('blob:') ||
    v.startsWith('data:')
  ) {
    return v
  }
  // object key — prepend storage base
  return STORAGE_BASE ? `${STORAGE_BASE}/${v}` : v
}
