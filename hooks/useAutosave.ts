import { useEffect, useRef } from "react"
import type { Node, Edge } from "reactflow"

const DEBOUNCE_MS = 500

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
      batchResumeHandled: undefined,  // ephemeral: editor sets this; must not survive refresh
      src:
        typeof n.data?.src === "string" && n.data.src.startsWith("blob:")
          ? undefined
          : n.data?.src,
      // mediaFiles 中同样可能含 blob src
      mediaFiles: Array.isArray(n.data?.mediaFiles)
        ? (n.data.mediaFiles as any[]).map((mf) => ({
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
//
// enabled: false 时跳过（初始 draft 加载完成前传 false，
//          防止空 state 覆盖已有草稿）
// ─────────────────────────────────────────────
export function useAutosave(
  nodes: Node[],
  edges: Edge[],
  enabled: boolean,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/draft", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            nodes: sanitizeNodes(nodes),
            edges,
          }),
        })
        
        if (!res.ok) {
          if (res.status === 401) {
            console.warn("[autosave] Not authenticated, cannot save draft")
            // User not logged in - autosave should be disabled by parent component
            return
          }
          console.warn("[autosave] Server error:", res.status)
          return
        }
        
        // Success - silent save
        console.log("[autosave] Draft saved successfully")
      } catch (err) {
        console.error("[autosave] Network error:", err)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [nodes, edges, enabled])
}
