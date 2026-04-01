import { useEffect, useRef } from "react"
import type { MutableRefObject } from "react"
import type { Node, Edge } from "reactflow"

const DEBOUNCE_MS = 500

export type SyncStatus = "syncing" | "synced" | "offline" | "error"

// ─────────────────────────────────────────────
// 存入前清理不可序列化字段：
//   • rawFile  — File 对象
//   • blob: src — 页面刷新后失效的 ObjectURL
//   • onDataChange / onDelete — 注入的回调
// 图片的持久化 URL 由 Minio 上传后写入 data.src（非 blob:），可安全保留。
// ─────────────────────────────────────────────
function sanitizeNodes(nodes: Node[]): Node[] {
  return nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      rawFile:            undefined,
      onDataChange:       undefined,
      onDelete:           undefined,
      templateResumeHandled: undefined,
      src:
        typeof n.data?.src === "string" && n.data.src.startsWith("blob:")
          ? undefined
          : n.data?.src,
      mediaFiles: Array.isArray(n.data?.mediaFiles)
        ? (n.data.mediaFiles as Array<Record<string, unknown>>).map((mf) => ({
            ...mf,
            rawFile: undefined,
            src:
              typeof mf.src === "string" && mf.src.startsWith("blob:")
                ? undefined
                : mf.src,
          }))
        : n.data?.mediaFiles,
    },
  }))
}

// ─────────────────────────────────────────────
// useAutosave
// ─────────────────────────────────────────────
export function useAutosave(
  nodes:                Node[],
  edges:                Edge[],
  favorites:            string[],
  enabled:              boolean,
  viewportRef:          MutableRefObject<{ x: number; y: number; zoom: number }>,
  onSyncStatusChange?:  (status: SyncStatus) => void,
  skipRef?:             MutableRefObject<boolean>,
) {
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusCallbackRef = useRef(onSyncStatusChange)
  useEffect(() => { statusCallbackRef.current = onSyncStatusChange }, [onSyncStatusChange])

  useEffect(() => {
    if (!enabled) return

    // Skip one cycle when undo/redo has just restored state (server already updated)
    if (skipRef?.current) {
      skipRef.current = false
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      if (!navigator.onLine) {
        statusCallbackRef.current?.("offline")
        return
      }

      statusCallbackRef.current?.("syncing")
      try {
        const res = await fetch("/api/draft", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            nodes:    sanitizeNodes(nodes),
            edges,
            favorites,
            viewport: viewportRef.current,
          }),
        })

        if (!res.ok) {
          if (res.status === 401) {
            console.warn("[autosave] Not authenticated, cannot save draft")
            statusCallbackRef.current?.("error")
            return
          }
          console.warn("[autosave] Server error:", res.status)
          statusCallbackRef.current?.("error")
          return
        }

        statusCallbackRef.current?.("synced")
        console.log("[autosave] Draft saved successfully")
      } catch (err) {
        console.error("[autosave] Network error:", err)
        statusCallbackRef.current?.(navigator.onLine ? "error" : "offline")
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [nodes, edges, favorites, enabled, viewportRef])
}
