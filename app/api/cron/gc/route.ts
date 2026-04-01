/**
 * POST /api/cron/gc
 *
 * Orphaned-asset garbage collector.
 *
 * For each user who has a draft, it:
 *   1. Collects all MinIO keys referenced by their canvas + undo snapshots.
 *   2. Lists all MinIO objects stored under their userId/ prefix.
 *   3. Deletes any object that is not referenced (orphan).
 *
 * Designed to be lightweight:
 *   - Processes users one at a time (no thundering-herd on MinIO).
 *   - Hard cap of MAX_DELETES_PER_RUN deletes per invocation.
 *   - Skips users whose draft hasn't changed in IDLE_DAYS days (their assets
 *     are already stable and were likely cleaned on the previous run).
 *   - Only objects under userId/ prefix are touched — old flat-keyed assets
 *     (uploaded before the prefix change) are never deleted automatically.
 *
 * Call this from a cron job (e.g. `0 3 * * *`):
 *   curl -X POST https://your-app/api/cron/gc \
 *        -H "x-cron-secret: <CRON_SECRET>"
 *
 * Set CRON_SECRET in your env to secure the endpoint.
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma }                    from "@/lib/prisma"
import { listFiles, deleteFile } from "@/lib/storage"
import { extractAllReferencedKeys }  from "@/lib/assetGC"

// ── Tunables ────────────────────────────────────────────────────────────────
/** Skip users whose draft was last saved more than this many days ago. */
const IDLE_DAYS = 30

/** Hard cap on MinIO deletes per single cron run (safety valve). */
const MAX_DELETES_PER_RUN = 300

/**
 * Delete completed/failed Job rows older than this many days.
 * Keeps TOAST file small — prevents recurring "unexpected data beyond EOF"
 * errors caused by partial TOAST writes when the host disk fills up.
 */
const JOB_RETENTION_DAYS = 14

// ── Auth ─────────────────────────────────────────────────────────────────────
const CRON_SECRET = process.env.CRON_SECRET ?? ""

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Reject if a secret is configured and the caller didn't supply it
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - IDLE_DAYS * 24 * 60 * 60 * 1000)

  // Only process users whose draft was updated recently (skip idle accounts)
  const drafts = await prisma.riffDraft.findMany({
    where:  { updatedAt: { gte: cutoff } },
    select: { userId: true, nodesJson: true },
  })

  let usersScanned  = 0
  let totalOrphans  = 0
  let totalDeleted  = 0
  let totalErrors   = 0

  for (const draft of drafts) {
    if (totalDeleted >= MAX_DELETES_PER_RUN) break

    const { userId, nodesJson } = draft

    // 1. Collect referenced keys from canvas + all snapshots
    const snapshots = await prisma.riffDraftSnapshot.findMany({
      where:  { userId },
      select: { nodesJson: true },
    })

    const referencedKeys = extractAllReferencedKeys(
      Array.isArray(nodesJson) ? (nodesJson as { data?: Record<string, unknown> }[]) : [],
      snapshots,
    )

    // 2. List all objects under userId/ prefix
    let objectsInStorage: string[] = []
    try {
      objectsInStorage = await listFiles(`${userId}/`)
    } catch {
      // If we can't list for this user, skip rather than crash the whole job
      totalErrors++
      usersScanned++
      continue
    }

    // 3. Identify and delete orphans
    const orphans = objectsInStorage.filter((key) => !referencedKeys.has(key))
    totalOrphans += orphans.length

    for (const key of orphans) {
      if (totalDeleted >= MAX_DELETES_PER_RUN) break
      try {
        await deleteFile(key)
        totalDeleted++
      } catch {
        totalErrors++
      }
    }

    usersScanned++
  }

  // ── Job table cleanup ──────────────────────────────────────────────────────
  // Delete old completed/failed jobs to prevent TOAST bloat.
  // Keeps the Job TOAST file from growing unboundedly and causing partial-write
  // corruption when the host filesystem runs low on space.
  const jobCutoff = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  let jobsDeleted = 0
  let jobVacuumOk = false
  try {
    const { count } = await prisma.job.deleteMany({
      where: {
        status:    { in: ["done", "failed"] },
        updatedAt: { lt: jobCutoff },
      },
    })
    jobsDeleted = count

    // VACUUM ANALYZE reclaims space from deleted TOAST chunks and rebuilds
    // planner statistics — prevents stale TOAST index pointers.
    if (count > 0) {
      await prisma.$executeRawUnsafe(`VACUUM ANALYZE "Job"`)
      await prisma.$executeRawUnsafe(`VACUUM ANALYZE "WorkflowJob"`)
    }
    jobVacuumOk = true
  } catch (err) {
    console.error("[cron/gc] job cleanup failed:", err)
  }

  const summary = { usersScanned, totalOrphans, totalDeleted, totalErrors, jobsDeleted, jobVacuumOk }
  console.log("[cron/gc]", summary)
  return NextResponse.json(summary)
}
