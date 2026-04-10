import { extractStorageObjectKey, toStoragePublicUrl } from "@/lib/asset-ref"

type JsonRecord = Record<string, unknown>

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isEphemeralUrl(v: unknown): boolean {
  return typeof v === "string" && (v.startsWith("blob:") || v.startsWith("data:"))
}

function normalizeAssetField(
  data: JsonRecord,
  urlField: string,
  keyField: string,
  stripEphemeral: boolean,
) {
  const keyFromField = extractStorageObjectKey(data[keyField])
  const keyFromUrl = extractStorageObjectKey(data[urlField])
  const key = keyFromField ?? keyFromUrl

  if (key) {
    data[keyField] = key
    data[urlField] = toStoragePublicUrl(key)
    return
  }

  if (stripEphemeral && isEphemeralUrl(data[urlField])) {
    delete data[urlField]
    delete data[keyField]
  }
}

function normalizeMediaFiles(data: JsonRecord, stripEphemeral: boolean) {
  if (!Array.isArray(data.mediaFiles)) return
  data.mediaFiles = data.mediaFiles.map((mf) => {
    if (!isRecord(mf)) return mf
    const next = { ...mf }

    const keyFromField = extractStorageObjectKey(next.srcKey)
    const keyFromUrl = extractStorageObjectKey(next.src)
    const key = keyFromField ?? keyFromUrl

    if (key) {
      next.srcKey = key
      next.src = toStoragePublicUrl(key)
      return next
    }

    if (stripEphemeral && isEphemeralUrl(next.src)) {
      delete next.src
      delete next.srcKey
    }

    return next
  })
}

export function normalizeDraftNode(
  node: unknown,
  options: { stripEphemeral: boolean; stripRuntimeFields: boolean },
): unknown {
  if (!isRecord(node)) return node

  const data = isRecord(node.data) ? node.data : undefined
  if (!data) return node

  const cleanData: JsonRecord = { ...data }

  normalizeAssetField(cleanData, "src", "srcKey", options.stripEphemeral)
  normalizeAssetField(cleanData, "videoSrc", "videoSrcKey", options.stripEphemeral)
  normalizeAssetField(cleanData, "videoPoster", "videoPosterKey", options.stripEphemeral)
  normalizeAssetField(cleanData, "pdfSrc", "pdfSrcKey", options.stripEphemeral)
  normalizeMediaFiles(cleanData, options.stripEphemeral)

  if (options.stripRuntimeFields) {
    delete cleanData.rawFile
    delete cleanData.onDataChange
    delete cleanData.onDelete
  }

  return { ...node, data: cleanData }
}

export function normalizeDraftNodes(
  nodes: unknown[],
  options: { stripEphemeral: boolean; stripRuntimeFields: boolean },
): unknown[] {
  return nodes.map((n) => normalizeDraftNode(n, options))
}
