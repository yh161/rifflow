/**
 * scripts/migrate-storage-urls.ts
 *
 * One-time migration: convert domain-tied absolute URLs stored in node data
 * (src, videoSrc, videoPoster, pdfSrc, mediaFiles[].src, template thumbnail)
 * into stable storage object keys (e.g. "userId/uuid.ext").
 *
 * Why:
 *   Old deployments stored full MinIO URLs like
 *   "https://old-domain.run.app/node-images/userId/uuid.pdf"
 *   If the domain changes, those URLs become unreachable.
 *   The new system stores only the object key and resolves URLs at render time.
 *
 * Usage:
 *   OLD_STORAGE_BASE="https://old-domain.run.app/node-images" \
 *   DATABASE_URL="..." \
 *   npx tsx scripts/migrate-storage-urls.ts [--dry-run]
 *
 *   OLD_STORAGE_BASE is the old MINIO_PUBLIC_URL/bucket, e.g.:
 *     https://rifflow.northasia.run.app/node-images
 *   You can pass multiple comma-separated bases if you've had more than one:
 *     OLD_STORAGE_BASE="https://old1.run.app/node-images,https://old2.run.app/node-images"
 *
 * Safe to run multiple times (idempotent).
 */

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, Prisma } from "@prisma/client"

const isDryRun = process.argv.includes("--dry-run")

const rawBases = (process.env.OLD_STORAGE_BASE ?? "").trim()
if (!rawBases) {
  console.error("❌  Set OLD_STORAGE_BASE to the old MinIO public URL (e.g. https://old-domain.run.app/node-images)")
  process.exit(1)
}

// Support multiple old bases (comma-separated)
const OLD_BASES: string[] = rawBases
  .split(",")
  .map((b) => b.trim().replace(/\/$/, ""))
  .filter(Boolean)

console.log("Old storage bases:", OLD_BASES)

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ─── helpers ─────────────────────────────────────────────────────────────────

function extractKey(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  if (!v || v.startsWith("blob:") || v.startsWith("data:")) return null

  // Already an object key (no scheme, has a slash, not an absolute path)
  if (!v.includes("://") && v.includes("/") && !v.startsWith("/")) return v

  // Try stripping each old base
  for (const base of OLD_BASES) {
    const prefix = base + "/"
    if (v.startsWith(prefix)) {
      return v.slice(prefix.length)
    }
  }

  return null
}

type JsonRecord = Record<string, unknown>

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function migrateAssetField(data: JsonRecord, urlField: string, keyField: string): boolean {
  let changed = false

  const key = extractKey(data[urlField]) ?? extractKey(data[keyField])
  if (key && data[keyField] !== key) {
    data[keyField] = key
    changed = true
  }
  // Also strip the stale full URL from the url field; it will be re-derived at load time
  // by normalizeDraftNode using the current STORAGE_PUBLIC_BASE.
  // We leave urlField alone here so backward-compat loading still works until next save.

  return changed
}

function migrateMediaFiles(data: JsonRecord): boolean {
  if (!Array.isArray(data.mediaFiles)) return false
  let changed = false
  data.mediaFiles = data.mediaFiles.map((mf) => {
    if (!isRecord(mf)) return mf
    const key = extractKey(mf.src) ?? extractKey(mf.srcKey)
    if (key && mf.srcKey !== key) {
      changed = true
      return { ...mf, srcKey: key }
    }
    return mf
  })
  return changed
}

function migrateNode(node: unknown): { node: unknown; changed: boolean } {
  if (!isRecord(node)) return { node, changed: false }
  const data = isRecord(node.data) ? node.data : undefined
  if (!data) return { node, changed: false }

  const d: JsonRecord = { ...data }
  let changed = false

  changed = migrateAssetField(d, "src",        "srcKey")        || changed
  changed = migrateAssetField(d, "videoSrc",   "videoSrcKey")   || changed
  changed = migrateAssetField(d, "videoPoster","videoPosterKey") || changed
  changed = migrateAssetField(d, "pdfSrc",     "pdfSrcKey")     || changed
  changed = migrateMediaFiles(d)                                 || changed

  if (!changed) return { node, changed: false }
  return { node: { ...node, data: d }, changed: true }
}

function migrateNodes(nodes: Prisma.JsonValue[]): { nodes: Prisma.JsonValue[]; changed: boolean } {
  let anyChanged = false
  const result = nodes.map((n) => {
    const { node, changed } = migrateNode(n)
    if (changed) anyChanged = true
    return node as Prisma.JsonValue
  })
  return { nodes: result, changed: anyChanged }
}

function migrateThumbnail(thumbnail: string | null | undefined): { value: string | null; changed: boolean } {
  if (!thumbnail) return { value: thumbnail ?? null, changed: false }
  const key = extractKey(thumbnail)
  if (key && key !== thumbnail) return { value: key, changed: true }
  return { value: thumbnail, changed: false }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (isDryRun) console.log("🔍  DRY RUN — no writes\n")

  let draftFixed = 0, draftSkipped = 0
  let templateFixed = 0, templateSkipped = 0

  // ── Drafts ─────────────────────────────────────────────────────────────────
  console.log("=== Migrating RiffDraft nodes ===")
  const drafts = await prisma.riffDraft.findMany({
    select: { id: true, nodesJson: true },
  })
  console.log(`  Found ${drafts.length} draft(s)`)

  for (const draft of drafts) {
    const nodes = Array.isArray(draft.nodesJson) ? draft.nodesJson : []
    const { nodes: migratedNodes, changed } = migrateNodes(nodes)

    if (!changed) { draftSkipped++; continue }

    console.log(`  Draft ${draft.id}: nodes updated`)
    if (!isDryRun) {
      await prisma.riffDraft.update({
        where: { id: draft.id },
        data: { nodesJson: migratedNodes as Prisma.InputJsonValue },
      })
    }
    draftFixed++
  }

  // ── Templates ──────────────────────────────────────────────────────────────
  console.log("\n=== Migrating Template nodes & thumbnails ===")
  const templates = await prisma.template.findMany({
    select: { id: true, name: true, thumbnail: true, canvasSnapshot: true },
  })
  console.log(`  Found ${templates.length} template(s)`)

  for (const tmpl of templates) {
    let changed = false
    const update: Prisma.TemplateUpdateInput = {}

    // Thumbnail
    const { value: newThumb, changed: thumbChanged } = migrateThumbnail(tmpl.thumbnail)
    if (thumbChanged) {
      update.thumbnail = newThumb
      changed = true
      console.log(`  Template ${tmpl.id} (${tmpl.name}): thumbnail ${tmpl.thumbnail} → ${newThumb}`)
    }

    // canvasSnapshot nodes
    const snapshot = isRecord(tmpl.canvasSnapshot) ? tmpl.canvasSnapshot : null
    if (snapshot && Array.isArray(snapshot.nodes)) {
      const { nodes: migratedNodes, changed: nodesChanged } = migrateNodes(snapshot.nodes)
      if (nodesChanged) {
        update.canvasSnapshot = { ...snapshot, nodes: migratedNodes } as Prisma.InputJsonValue
        changed = true
        console.log(`  Template ${tmpl.id} (${tmpl.name}): canvas nodes updated`)
      }
    }

    if (!changed) { templateSkipped++; continue }
    if (!isDryRun) {
      await prisma.template.update({ where: { id: tmpl.id }, data: update })
    }
    templateFixed++
  }

  // ── Snapshots (undo/redo history) ──────────────────────────────────────────
  console.log("\n=== Migrating RiffDraftSnapshot nodes ===")
  const snapshots = await prisma.riffDraftSnapshot.findMany({
    select: { id: true, nodesJson: true },
  })
  console.log(`  Found ${snapshots.length} snapshot(s)`)

  let snapshotFixed = 0
  for (const snap of snapshots) {
    const nodes = Array.isArray(snap.nodesJson) ? snap.nodesJson : []
    const { nodes: migratedNodes, changed } = migrateNodes(nodes)
    if (!changed) continue
    if (!isDryRun) {
      await prisma.riffDraftSnapshot.update({
        where: { id: snap.id },
        data: { nodesJson: migratedNodes as Prisma.InputJsonValue },
      })
    }
    snapshotFixed++
  }
  console.log(`  Fixed: ${snapshotFixed}`)

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n=== Summary ===")
  console.log(`  Drafts    — fixed: ${draftFixed}, skipped: ${draftSkipped}`)
  console.log(`  Templates — fixed: ${templateFixed}, skipped: ${templateSkipped}`)
  if (isDryRun) console.log("\n⚠️  Dry run complete — no data was written.")
  else console.log("\n✅  Migration complete.")
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
