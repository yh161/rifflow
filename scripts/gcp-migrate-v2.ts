/**
 * GCP Safe Migration Script — ChatRoom v2
 *
 * Fixes existing ChatRooms that were created before the v2 schema:
 *   - Sets ownerId (picks earliest "admin" member, which in 1-to-1 rooms = the creator)
 *   - Promotes that member's role from "admin" → "owner"
 *   - Optionally purges legacy DirectMessage rows (already migrated)
 *
 * Safe to run multiple times.
 *
 * Usage:
 *   DATABASE_URL=<gcp-url> npx tsx scripts/gcp-migrate-v2.ts [--dry-run] [--keep-dm]
 */

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

const isDryRun = process.argv.includes("--dry-run")
const keepDm = process.argv.includes("--keep-dm")

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  if (isDryRun) console.log("🔍 DRY RUN — no writes\n")

  // Audit
  const [roomCount, memberCount, msgCount, dmCount] = await Promise.all([
    prisma.chatRoom.count(),
    prisma.chatMember.count(),
    prisma.chatMessage.count(),
    prisma.directMessage.count(),
  ])
  const roomsMissingOwner = await prisma.chatRoom.count({ where: { ownerId: null } })
  const ownerMembers = await prisma.chatMember.count({ where: { role: "owner" } })
  const adminMembers = await prisma.chatMember.count({ where: { role: "admin" } })

  console.log("=== Current state ===")
  console.log(`  ChatRoom    : ${roomCount}`)
  console.log(`  ChatMember  : ${memberCount}`)
  console.log(`  ChatMessage : ${msgCount}`)
  console.log(`  DirectMessage : ${dmCount}`)
  console.log(`  Missing ownerId : ${roomsMissingOwner}`)
  console.log(`  Members with role=owner : ${ownerMembers}`)
  console.log(`  Members with role=admin : ${adminMembers}`)
  console.log(`  Legacy DM purge : ${keepDm ? "skip" : "enabled"}\n`)

  if (roomsMissingOwner === 0 && (keepDm || dmCount === 0)) {
    console.log("✅ Rooms already in v2 format and no DM purge needed. Nothing to do.")
    return
  }

  // Fix rooms missing ownerId
  const roomsToFix = await prisma.chatRoom.findMany({
    where: { ownerId: null },
    include: {
      members: { orderBy: { joinedAt: "asc" } },
    },
  })

  let fixed = 0
  let skipped = 0
  let dmDeleted = 0

  for (const room of roomsToFix) {
    // Pick owner: earliest "admin", else earliest member
    const ownerMember =
      room.members.find((m) => m.role === "admin") ??
      room.members.find((m) => m.role === "owner") ??
      room.members[0]

    if (!ownerMember) {
      console.log(`  ⚠️  Room ${room.id} has no members — skipping.`)
      skipped++
      continue
    }

    const ownerId = ownerMember.userId

    if (isDryRun) {
      console.log(`  [dry-run] Room ${room.id} → ownerId=${ownerId} (promote ${ownerMember.role} → owner)`)
      fixed++
      continue
    }

    await prisma.$transaction([
      prisma.chatRoom.update({
        where: { id: room.id },
        data: { ownerId },
      }),
      prisma.chatMember.updateMany({
        where: { roomId: room.id, userId: ownerId },
        data: { role: "owner" },
      }),
    ])

    console.log(`  ✅ Room ${room.id} → ownerId=${ownerId}`)
    fixed++
  }

  if (!keepDm) {
    if (isDryRun) {
      if (dmCount > 0) {
        console.log(`  [dry-run] Would delete ${dmCount} DirectMessage rows`)
      }
    } else {
      const deleted = await prisma.directMessage.deleteMany({})
      dmDeleted = deleted.count
      console.log(`  🧹 Deleted DirectMessage rows: ${dmDeleted}`)
    }
  }

  console.log(`\nFixed rooms: ${fixed} | Skipped rooms: ${skipped}`)
  if (!keepDm) {
    console.log(`Purged DirectMessage rows: ${isDryRun ? dmCount : dmDeleted}`)
  }

  if (!isDryRun) {
    const remaining = await prisma.chatRoom.count({ where: { ownerId: null } })
    const remainingDm = await prisma.directMessage.count()
    if (remaining === 0 && (keepDm || remainingDm === 0)) {
      console.log("\n🎉 Migration complete.")
    } else {
      console.log(`\n⚠️  Still ${remaining} rooms missing ownerId, ${remainingDm} DirectMessage rows.`)
    }
  }
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
