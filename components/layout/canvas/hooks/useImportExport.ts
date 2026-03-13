"use client"

import { Node, Edge } from "reactflow"
import JSZip from "jszip"
import type { AnyNodeData, StandardNodeData, CustomNodeData } from "@/components/layout/modules/_types"
import { CanvasState } from "./useCanvasState"

const GHOST_NODE_ID = "__ghost_drop__"
const GHOST_EDGE_ID = "__ghost_edge__"

/**
 * Import/Export logic extracted from canvas.tsx
 * Handles all import and export operations for the canvas
 */
export function useImportExport(canvasState: CanvasState) {
  const { nodesRef, edgesRef, setNodes, setEdges } = canvasState

  // ─────────────────────────────────────────────
  // Export functionality
  // ─────────────────────────────────────────────
  const handleExportPack = async (
    favorites: string[],
    onExportComplete?: () => void
  ) => {
    const zip = new JSZip()
    const assetsFolder = zip.folder("assets")
    const snapshotsFolder = zip.folder("snapshots")
    let stdNodeCounter = 0

    const exportableNodes = nodesRef.current.filter((n) => n.id !== GHOST_NODE_ID)
    const exportableEdges = edgesRef.current.filter((e) => e.id !== GHOST_EDGE_ID)

    const exportNodes = exportableNodes.map((node) => {
      const exportNode = { ...node, data: { ...node.data } }

      // Strip runtime-only callbacks before export
      delete exportNode.data.onDataChange
      delete exportNode.data.onDelete

      if (exportNode.type === "CustomNode") {
        if (exportNode.data.rawFile) {
          const ext = exportNode.data.rawFile.name.split(".").pop()
          const fileName = `${exportNode.id}.${ext}`
          assetsFolder?.file(fileName, exportNode.data.rawFile)
          exportNode.data.src = `assets/${fileName}`
          delete exportNode.data.rawFile
        }
      } else if (exportNode.type === "StandardNode") {
        stdNodeCounter++
        const folderName = `std_node_${stdNodeCounter}`
        const nodeFolder = snapshotsFolder?.folder(folderName)
        const nodeData = exportNode.data as StandardNodeData
        const mediaRefs: string[] = []
        const mediaFiles = nodeData.mediaFiles || []

        mediaFiles.forEach((mf, i) => {
          if (mf.rawFile) {
            const ext = mf.rawFile.name.split(".").pop()
            const mediaFileName = `media_${i}.${ext}`
            nodeFolder?.file(mediaFileName, mf.rawFile)
            mediaRefs.push(mediaFileName)
          } else if (mf.src && !mf.src.startsWith("blob:")) {
            mediaRefs.push(mf.src.replace(`snapshots/${folderName}/`, ""))
          }
        })

        nodeFolder?.file("data.json", JSON.stringify({
          labels: [nodeData.subType || "Entity"],
          properties: {
            name: nodeData.name || nodeData.label || "Unnamed",
            ...(nodeData.properties || {}),
            ...(mediaRefs.length > 0 ? { _media: mediaRefs } : {}),
          },
        }, null, 2))

        exportNode.data = {
          ...exportNode.data,
          _snapshotFolder: folderName,
          mediaFiles: mediaFiles.map((mf: any, i: number) => {
            const { rawFile, ...rest } = mf as any
            return { ...rest, src: mediaRefs[i] ? `snapshots/${folderName}/${mediaRefs[i]}` : mf.src }
          }),
        }
      }
      return exportNode
    })

    zip.file("canvas.json", JSON.stringify({
      nodes: exportNodes,
      edges: exportableEdges,
      favorites,
    }, null, 2))
    zip.file("metadata.json", JSON.stringify({
      appName: "Formula Canvas", version: "1.0",
      timestamp: new Date().toISOString(), stdNodeCount: stdNodeCounter,
    }, null, 2))

    const blob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `canvas_pack_${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
    
    onExportComplete?.()
  }

  // ─────────────────────────────────────────────
  // Import functionality
  // ─────────────────────────────────────────────
  const handleImportPack = async (
    file: File,
    onFavoritesImport: (favorites: string[]) => void,
    fitView: (options?: { padding?: number; duration?: number }) => void
  ) => {
    try {
      const zip = await JSZip.loadAsync(file)
      const canvasFile = zip.file("canvas.json")
      if (!canvasFile) throw new Error("缺少 canvas.json")

      const parsedData = JSON.parse(await canvasFile.async("string"))
      const importedNodes: Node[] = parsedData.nodes || []
      const importedEdges: Edge[] = parsedData.edges || []
      const importedFavorites: string[] = parsedData.favorites || []

      for (const node of importedNodes) {
        if (node.type === "CustomNode" && node.data.src?.startsWith("assets/")) {
          const assetFile = zip.file(node.data.src)
          if (assetFile) {
            const blob = await assetFile.async("blob")
            node.data.src = URL.createObjectURL(blob)
            node.data.rawFile = new File([blob], node.data.src.split("/").pop() || "file", { type: blob.type })
          }
        }
      }

      for (const node of importedNodes) {
        if (node.type === "StandardNode") {
          const mediaFiles = node.data.mediaFiles || []
          const restoredMedia = []
          for (const mf of mediaFiles) {
            if (mf.src?.startsWith("snapshots/")) {
              const mediaFile = zip.file(mf.src)
              if (mediaFile) {
                const blob = await mediaFile.async("blob")
                restoredMedia.push({ ...mf, src: URL.createObjectURL(blob), rawFile: new File([blob], mf.fileName, { type: blob.type }) })
              } else {
                restoredMedia.push(mf)
              }
            } else {
              restoredMedia.push(mf)
            }
          }
          node.data.mediaFiles = restoredMedia

          const folderName = node.data._snapshotFolder
          if (folderName) {
            const dataFile = zip.file(`snapshots/${folderName}/data.json`)
            if (dataFile) {
              const neo4jData = JSON.parse(await dataFile.async("string"))
              const { _media, name, ...otherProps } = neo4jData.properties || {}
              node.data.properties = { ...otherProps, ...(node.data.properties || {}) }
              if (name && !node.data.name) node.data.name = name
            }
          }
        }
      }

      setNodes(importedNodes)
      setEdges(importedEdges)

      if (importedFavorites.length > 0) onFavoritesImport(importedFavorites)

      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
    } catch (error) {
      console.error("解析文件包失败:", error)
      alert("导入失败，文件格式可能不正确！")
    }
  }

  return {
    handleExportPack,
    handleImportPack,
  }
}

export type ImportExport = ReturnType<typeof useImportExport>