"use client"

import { Node, Edge } from "reactflow"
import JSZip from "jszip"
import type { CanvasState } from "./useCanvasState"
import type { CustomNodeData, StandardNodeData } from "@/components/layout/modules/_types"

const GHOST_NODE_ID = "__ghost_drop__"
const GHOST_EDGE_ID = "__ghost_edge__"

// ─────────────────────────────────────────────
// Asset URL helpers
// ─────────────────────────────────────────────

function isRemoteUrl(s: unknown): s is string {
  return typeof s === "string" && (s.startsWith("http://") || s.startsWith("https://"))
}

function extFromUrl(url: string, fallback: string): string {
  return url.split("?")[0].split(".").pop()?.toLowerCase() || fallback
}

interface AssetEntry {
  url: string       // original remote URL
  zipPath: string   // path inside ZIP, e.g. "assets/abc123_src.png"
  file?: File       // populated during import
}

type NodeDataWithRuntimeFields = (CustomNodeData & StandardNodeData) & {
  onDataChange?: unknown
  onDelete?: unknown
  rawFile?: unknown
}

type AssetCandidateNodeData = {
  src?: unknown
  videoSrc?: unknown
  videoPoster?: unknown
  pdfSrc?: unknown
  pdfOutputImages?: unknown
  mediaFiles?: Array<{ src?: unknown }> | unknown
}

/**
 * Scan a node and collect all remote-URL assets.
 * Returns a list of { url, zipPath } to be fetched and packaged.
 */
function collectNodeAssets(node: Node): AssetEntry[] {
  const entries: AssetEntry[] = []
  const d = node.data as CustomNodeData & StandardNodeData

  if (node.type === "CustomNode") {
    if (isRemoteUrl(d.src)) {
      entries.push({ url: d.src!, zipPath: `assets/${node.id}_src.${extFromUrl(d.src!, "png")}` })
    }
    if (isRemoteUrl(d.videoSrc)) {
      entries.push({ url: d.videoSrc!, zipPath: `assets/${node.id}_videoSrc.${extFromUrl(d.videoSrc!, "mp4")}` })
    }
    if (isRemoteUrl(d.videoPoster)) {
      entries.push({ url: d.videoPoster!, zipPath: `assets/${node.id}_videoPoster.${extFromUrl(d.videoPoster!, "jpg")}` })
    }
    if (isRemoteUrl(d.pdfSrc)) {
      entries.push({ url: d.pdfSrc!, zipPath: `assets/${node.id}_pdfSrc.${extFromUrl(d.pdfSrc!, "pdf")}` })
    }
    if (Array.isArray(d.pdfOutputImages)) {
      d.pdfOutputImages.forEach((url, i) => {
        if (isRemoteUrl(url)) {
          entries.push({ url, zipPath: `assets/${node.id}_pdfOutput${i}.${extFromUrl(url, "jpg")}` })
        }
      })
    }
  }

  if (node.type === "StandardNode") {
    const mediaFiles = d.mediaFiles || []
    mediaFiles.forEach((mf, i) => {
      if (isRemoteUrl(mf.src)) {
        entries.push({ url: mf.src!, zipPath: `assets/${node.id}_media${i}.${extFromUrl(mf.src!, "bin")}` })
      }
    })
  }

  return entries
}

/**
 * Given a URL → zipPath map, replace all remote URLs in a node's data
 * with the corresponding zipPath references.
 */
function substituteNodeUrls(node: Node, urlToZipPath: Map<string, string>): Node {
  const d: NodeDataWithRuntimeFields = { ...(node.data as CustomNodeData & StandardNodeData) }

  if (node.type === "CustomNode") {
    if (d.src && urlToZipPath.has(d.src))           d.src        = urlToZipPath.get(d.src)!
    if (d.videoSrc && urlToZipPath.has(d.videoSrc)) d.videoSrc   = urlToZipPath.get(d.videoSrc)!
    if (d.videoPoster && urlToZipPath.has(d.videoPoster)) d.videoPoster = urlToZipPath.get(d.videoPoster)!
    if (d.pdfSrc && urlToZipPath.has(d.pdfSrc))     d.pdfSrc     = urlToZipPath.get(d.pdfSrc)!
    if (Array.isArray(d.pdfOutputImages)) {
      d.pdfOutputImages = d.pdfOutputImages.map((u) =>
        u && urlToZipPath.has(u) ? urlToZipPath.get(u)! : u
      )
    }
  }

  if (node.type === "StandardNode" && Array.isArray(d.mediaFiles)) {
    d.mediaFiles = d.mediaFiles.map(mf =>
      mf.src && urlToZipPath.has(mf.src)
        ? { ...mf, src: urlToZipPath.get(mf.src)! }
        : mf
    )
  }

  // Strip runtime-only fields
  delete d.onDataChange
  delete d.onDelete
  delete d.rawFile

  return { ...node, data: d }
}

/**
 * Given a zipPath → value map (blob URL or remote URL), restore a node's
 * asset references from zip paths.
 */
function restoreNodeUrls(node: Node, zipPathToValue: Map<string, string>): Node {
  const d = { ...node.data } as CustomNodeData & StandardNodeData

  if (node.type === "CustomNode") {
    if (d.src && zipPathToValue.has(d.src))                   d.src        = zipPathToValue.get(d.src)!
    if (d.videoSrc && zipPathToValue.has(d.videoSrc))         d.videoSrc   = zipPathToValue.get(d.videoSrc)!
    if (d.videoPoster && zipPathToValue.has(d.videoPoster))   d.videoPoster = zipPathToValue.get(d.videoPoster)!
    if (d.pdfSrc && zipPathToValue.has(d.pdfSrc))             d.pdfSrc     = zipPathToValue.get(d.pdfSrc)!
    if (Array.isArray(d.pdfOutputImages)) {
      d.pdfOutputImages = d.pdfOutputImages.map((u) =>
        u && zipPathToValue.has(u) ? zipPathToValue.get(u)! : u
      )
    }
  }

  if (node.type === "StandardNode" && Array.isArray(d.mediaFiles)) {
    d.mediaFiles = d.mediaFiles.map(mf =>
      mf.src && zipPathToValue.has(mf.src)
        ? { ...mf, src: zipPathToValue.get(mf.src)! }
        : mf
    )
  }

  return { ...node, data: d }
}

// Infer MIME type from file extension when browser/JSZip doesn't set blob.type
function mimeFromZipPath(zipPath: string): string {
  const ext = zipPath.split(".").pop()?.toLowerCase() || ""
  const map: Record<string, string> = {
    pdf:  "application/pdf",
    png:  "image/png",
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    gif:  "image/gif",
    webp: "image/webp",
    mp4:  "video/mp4",
    webm: "video/webm",
    mov:  "video/quicktime",
  }
  return map[ext] || "application/octet-stream"
}

// ─────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────
export function useImportExport(canvasState: CanvasState) {
  const { setNodes, setEdges } = canvasState

  // ───────────────────────────────────────────
  // EXPORT — build canvas pack ZIP
  // ───────────────────────────────────────────
  const handleExportPack = async (
    favorites: string[],
    onExportComplete?: () => void
  ) => {
    try {
      // 1. Fetch current draft, snapshots, and template metadata
      const [draftRes, snapshotsRes, metaRes] = await Promise.all([
        fetch("/api/draft"),
        fetch("/api/draft/snapshots"),
        fetch("/api/draft/meta"),
      ])
      if (!draftRes.ok) throw new Error("Failed to fetch draft")

      const draft = await draftRes.json()
      const snapshotsData = snapshotsRes.ok ? await snapshotsRes.json() : { snapshots: [] }
      const meta = metaRes.ok ? await metaRes.json() : {}

      const nodes: Node[]   = Array.isArray(draft.nodesJson) ? draft.nodesJson : []
      const edges: Edge[]   = Array.isArray(draft.edgesJson) ? draft.edgesJson : []
      const viewport        = draft.viewportJson ?? { x: 0, y: 0, zoom: 1 }
      const snapshots: Array<{ nodesJson: Node[]; edgesJson: Edge[]; viewportJson: unknown; createdAt: string }> =
        snapshotsData.snapshots ?? []

      // 2. Collect all unique remote-URL assets across nodes + snapshots
      const urlToZipPath = new Map<string, string>()

      const allNodeSets = [
        nodes,
        ...snapshots.map(s => (Array.isArray(s.nodesJson) ? s.nodesJson as Node[] : [])),
      ]

      for (const nodeSet of allNodeSets) {
        for (const node of nodeSet) {
          for (const entry of collectNodeAssets(node)) {
            if (!urlToZipPath.has(entry.url)) {
              urlToZipPath.set(entry.url, entry.zipPath)
            }
          }
        }
      }

      // 3. Fetch assets and build ZIP
      const zip = new JSZip()

      await Promise.all(
        Array.from(urlToZipPath.entries()).map(async ([url, zipPath]) => {
          try {
            const res = await fetch(url)
            if (!res.ok) return
            const blob = await res.blob()
            zip.file(zipPath, blob)
          } catch {
            // If an asset can't be fetched, skip it (URL remains in canvas.json as fallback)
          }
        })
      )

      // 4. Replace remote URLs with zip paths in nodes
      const exportNodes = nodes
        .filter(n => n.id !== GHOST_NODE_ID)
        .map(n => substituteNodeUrls(n, urlToZipPath))
      const exportEdges = edges.filter(e => e.id !== GHOST_EDGE_ID)

      // 5. canvas.json
      zip.file("canvas.json", JSON.stringify({
        nodes:    exportNodes,
        edges:    exportEdges,
        viewport,
        favorites,
      }, null, 2))

      // 6. Download cover image if available
      const coverUrl: string | undefined = meta.thumbnail
      let coverZipPath: string | null = null
      if (coverUrl) {
        try {
          const coverRes = await fetch(coverUrl)
          if (coverRes.ok) {
            const coverBlob = await coverRes.blob()
            const ext = coverUrl.split("?")[0].split(".").pop()?.toLowerCase() || "jpg"
            coverZipPath = `cover.${ext}`
            zip.file(coverZipPath, coverBlob)
          }
        } catch { /* cover fetch failure is non-fatal */ }
      }

      // 7. metadata.json
      zip.file("metadata.json", JSON.stringify({
        appName:      "Formula Canvas",
        version:      "1.0",
        exportedAt:   new Date().toISOString(),
        name:         meta.name ?? null,
        description:  meta.description ?? null,
        tags:         meta.tags ?? [],
        cover:        coverZipPath,
        nodeCount:    exportNodes.length,
        edgeCount:    exportEdges.length,
        assetCount:   urlToZipPath.size,
        snapshotCount: snapshots.length,
      }, null, 2))

      // 8. snapshots/snapshot_NNN.json (oldest → newest)
      const snapshotsFolder = zip.folder("snapshots")
      snapshots.forEach((snap, i) => {
        const snapNodes = (Array.isArray(snap.nodesJson) ? snap.nodesJson as Node[] : [])
          .map(n => substituteNodeUrls(n, urlToZipPath))
        const snapEdges = Array.isArray(snap.edgesJson) ? snap.edgesJson : []
        const idx = String(i).padStart(3, "0")
        snapshotsFolder?.file(`snapshot_${idx}.json`, JSON.stringify({
          nodes:    snapNodes,
          edges:    snapEdges,
          viewport: snap.viewportJson,
          savedAt:  snap.createdAt,
        }, null, 2))
      })

      // 9. Generate and download
      const blob = await zip.generateAsync({ type: "blob" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      const safeName = (meta.name as string | undefined)
        ? (meta.name as string).replace(/[^\w\u4e00-\u9fff\s-]/g, "").trim().replace(/\s+/g, "_") || "canvas"
        : "canvas"
      const dateStr = new Date().toISOString().split("T")[0]
      a.download = `${safeName}_${dateStr}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[export] Failed:", err)
      alert("导出失败，请重试")
    }

    onExportComplete?.()
  }

  // ───────────────────────────────────────────
  // IMPORT — load canvas pack ZIP
  // ───────────────────────────────────────────
  const handleImportPack = async (
    file: File,
    _onFavoritesImport: (favorites: string[]) => void,
    fitView: (options?: { padding?: number; duration?: number }) => void
  ): Promise<{ nodes: Node[]; edges: Edge[] } | null> => {
    try {
      const zip = await JSZip.loadAsync(file)

      const canvasFile = zip.file("canvas.json")
      if (!canvasFile) throw new Error("Missing canvas.json")

      const parsed   = JSON.parse(await canvasFile.async("string"))
      let nodes: Node[]      = Array.isArray(parsed.nodes) ? parsed.nodes : []
      const edges: Edge[]    = Array.isArray(parsed.edges) ? parsed.edges : []
      const viewport         = parsed.viewport ?? { x: 0, y: 0, zoom: 1 }
      const favorites        = Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((x: unknown): x is string => typeof x === "string")
        : []

      // 1. Collect all assets/ references from nodes
      const zipPaths = new Set<string>()
      const allNodes = [...nodes]
      for (const node of allNodes) {
        // entries from zip will have zipPath-like src (e.g. "assets/xxx")
        const d = node.data as AssetCandidateNodeData
        const mediaFiles = Array.isArray(d.mediaFiles)
          ? (d.mediaFiles as Array<{ src?: unknown }>)
          : []
        const candidates = [
          d.src,
          d.videoSrc,
          d.videoPoster,
          d.pdfSrc,
          ...(Array.isArray(d.pdfOutputImages) ? d.pdfOutputImages : []),
          ...mediaFiles.map((m) => m.src),
        ]
        for (const c of candidates) {
          if (typeof c === "string" && c.startsWith("assets/")) zipPaths.add(c)
        }
        // also collect directly
        if (typeof d.src        === "string" && d.src.startsWith("assets/"))        zipPaths.add(d.src)
        if (typeof d.videoSrc   === "string" && d.videoSrc.startsWith("assets/"))   zipPaths.add(d.videoSrc)
        if (typeof d.videoPoster=== "string" && d.videoPoster.startsWith("assets/")) zipPaths.add(d.videoPoster)
        if (typeof d.pdfSrc     === "string" && d.pdfSrc.startsWith("assets/"))     zipPaths.add(d.pdfSrc)
        if (Array.isArray(d.pdfOutputImages)) {
          for (const out of d.pdfOutputImages) {
            if (typeof out === "string" && out.startsWith("assets/")) zipPaths.add(out)
          }
        }
        if (Array.isArray(d.mediaFiles)) {
          for (const mf of d.mediaFiles as Array<{ src?: unknown }>) {
            if (typeof mf.src === "string" && mf.src.startsWith("assets/")) zipPaths.add(mf.src)
          }
        }
      }

      // 2. Build zipPath → blob URL map
      const zipPathToBlob = new Map<string, string>()
      const zipPathToFile = new Map<string, File>()

      await Promise.all(
        Array.from(zipPaths).map(async (zipPath) => {
          const entry = zip.file(zipPath)
          if (!entry) return
          const blob     = await entry.async("blob")
          const fileName = zipPath.split("/").pop() || "file"
          const blobUrl  = URL.createObjectURL(blob)
          zipPathToBlob.set(zipPath, blobUrl)
          const mime = blob.type || mimeFromZipPath(zipPath)
          zipPathToFile.set(zipPath, new File([blob], fileName, { type: mime }))
        })
      )

      // 3. Restore blob URLs in nodes for immediate display
      nodes = nodes.map(n => restoreNodeUrls(n, zipPathToBlob))

      // 4. Update canvas
      setNodes(nodes)
      setEdges(edges)
      _onFavoritesImport(favorites)
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)

      // 5. If online: upload assets to server and replace blob URLs with MinIO URLs
      if (navigator.onLine) {
        const zipPathToMinioUrl = new Map<string, string>()

        await Promise.all(
          Array.from(zipPathToFile.entries()).map(async ([zipPath, assetFile]) => {
            try {
              const form = new FormData()
              form.append("file", assetFile)
              const res  = await fetch("/api/upload", { method: "POST", body: form })
              if (!res.ok) return
              const { url } = await res.json()
              if (url) zipPathToMinioUrl.set(zipPath, url)
            } catch {
              // keep blob URL if upload fails
            }
          })
        )

        // Build blobUrl → MinioUrl map
        const blobToMinio = new Map<string, string>()
        for (const [zipPath, blobUrl] of zipPathToBlob) {
          const minioUrl = zipPathToMinioUrl.get(zipPath)
          if (minioUrl) blobToMinio.set(blobUrl, minioUrl)
        }

        let serverNodes = nodes.map(n => restoreNodeUrls(n, blobToMinio))

        // ── Legacy pass: handle raw http:// URLs left in canvas.json (old packs) ──
        // Collect any remaining remote URLs that weren't bundled in the ZIP
        const legacyUrlToStorage = new Map<string, string>()
        const legacyUrls = new Set<string>()
        for (const node of serverNodes) {
          for (const entry of collectNodeAssets(node)) {
            legacyUrls.add(entry.url)
          }
        }
        if (legacyUrls.size > 0) {
          await Promise.all(
            Array.from(legacyUrls).map(async (url) => {
              try {
                const res = await fetch(url)
                if (!res.ok) return
                const blob = await res.blob()
                const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "bin"
                const mime = blob.type || mimeFromZipPath(`file.${ext}`)
                const assetFile = new File([blob], `asset.${ext}`, { type: mime })
                const form = new FormData()
                form.append("file", assetFile)
                const uploadRes = await fetch("/api/upload", { method: "POST", body: form })
                if (!uploadRes.ok) return
                const { url: newUrl } = await uploadRes.json()
                if (newUrl) legacyUrlToStorage.set(url, newUrl)
              } catch {
                // URL unreachable in this environment (e.g. localhost:9000 on GCP) — skip silently
              }
            })
          )
          if (legacyUrlToStorage.size > 0) {
            serverNodes = serverNodes.map(n => restoreNodeUrls(n, legacyUrlToStorage))
          }
        }

        // Sync to server
        await fetch("/api/draft", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ nodes: serverNodes, edges, viewport, favorites }),
        })

        // Update canvas with MinIO URLs so autosave works correctly
        setNodes(serverNodes)
        return { nodes: serverNodes, edges }
      }

      return { nodes, edges }
    } catch (err) {
      console.error("[import] Failed:", err)
      alert("导入失败，文件格式可能不正确")
      return null
    }
  }

  return { handleExportPack, handleImportPack }
}

export type ImportExport = ReturnType<typeof useImportExport>
