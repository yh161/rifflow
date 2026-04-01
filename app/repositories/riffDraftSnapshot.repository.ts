// RiffDraftSnapshot repository implementation

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

const MAX_SNAPSHOTS = 40
const THROTTLE_MS   = 5_000   // minimum 5 s between snapshots

export class RiffDraftSnapshotRepository {
  private prisma = prisma

  /**
   * Create a snapshot if enough time has elapsed since the last one.
   * Clears the redo stack (any isRedo=true snapshots) on new edits.
   * Automatically prunes old snapshots beyond MAX_SNAPSHOTS.
   */
  async pushIfThrottled(
    userId:   string,
    nodesJson:    Prisma.InputJsonValue,
    edgesJson:    Prisma.InputJsonValue,
    viewportJson: Prisma.InputJsonValue,
  ): Promise<boolean> {
    // Clear redo stack — new edit invalidates any future redo
    await this.prisma.riffDraftSnapshot.deleteMany({
      where: { userId, isRedo: true },
    })

    // Check last undo snapshot timestamp
    const latest = await this.prisma.riffDraftSnapshot.findFirst({
      where:   { userId, isRedo: false },
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true },
    })

    if (latest && Date.now() - latest.createdAt.getTime() < THROTTLE_MS) {
      return false // too soon
    }

    // Create new snapshot
    await this.prisma.riffDraftSnapshot.create({
      data: { userId, nodesJson, edgesJson, viewportJson },
    })

    // Prune oldest undo snapshots if over limit
    const count = await this.prisma.riffDraftSnapshot.count({
      where: { userId, isRedo: false },
    })
    if (count > MAX_SNAPSHOTS) {
      const oldest = await this.prisma.riffDraftSnapshot.findMany({
        where:   { userId, isRedo: false },
        orderBy: { createdAt: "asc" },
        take:    count - MAX_SNAPSHOTS,
        select:  { id: true },
      })
      if (oldest.length > 0) {
        await this.prisma.riffDraftSnapshot.deleteMany({
          where: { id: { in: oldest.map((s) => s.id) } },
        })
      }
    }

    return true
  }

  /**
   * Undo: mark the latest undo snapshot as isRedo, return the one before it.
   * Returns null if fewer than 2 undo snapshots exist (nothing to undo).
   */
  async popAndGetPrevious(userId: string) {
    const top2 = await this.prisma.riffDraftSnapshot.findMany({
      where:   { userId, isRedo: false },
      orderBy: { createdAt: "desc" },
      take:    2,
    })

    if (top2.length < 2) return null

    // Mark the latest as redo (don't delete — needed for redo)
    await this.prisma.riffDraftSnapshot.update({
      where: { id: top2[0].id },
      data:  { isRedo: true },
    })

    return top2[1]
  }

  /**
   * Redo: pop the latest redo snapshot, restore it back to undo stack, return it.
   * Returns null if no redo snapshots exist.
   */
  async popFromRedoStack(userId: string) {
    const top = await this.prisma.riffDraftSnapshot.findFirst({
      where:   { userId, isRedo: true },
      orderBy: { createdAt: "desc" },
    })

    if (!top) return null

    await this.prisma.riffDraftSnapshot.update({
      where: { id: top.id },
      data:  { isRedo: false },
    })

    return top
  }

  /** Count undo snapshots available. */
  async count(userId: string): Promise<number> {
    return this.prisma.riffDraftSnapshot.count({ where: { userId, isRedo: false } })
  }

  /** Count redo snapshots available. */
  async countRedo(userId: string): Promise<number> {
    return this.prisma.riffDraftSnapshot.count({ where: { userId, isRedo: true } })
  }
}
