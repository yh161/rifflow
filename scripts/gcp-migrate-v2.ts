/**
 * GCP Safe Migration Script — ChatRoom v2
 *
 * Fixes existing ChatRooms that were created before the v2 schema:
 *   - Sets ownerId (picks earliest "admin" member, which in 1-to-1 rooms = the creator)
 *   - Promotes that member's role from "admin" → "owner"
 *
 * Safe to run multiple times — skips rooms that already have ownerId set.
 *
 * Usage:
 *   DATABASE_URL=<gcp-url> npx tsx scripts/gcp-migrate-v2.ts [--dry-run]
 */

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

const isDryRun = process.argv.includes("--dry-run")

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  if (isDryRun) console.log("🔍 DRY RUN — no writes\n")

  // Audit
  const [roomCount, memberCount, msgCount] = await Promise.all([
    prisma.chatRoom.count(),
    prisma.chatMember.count(),
    prisma.chatMessage.count(),
  ])
  const roomsMissingOwner = await prisma.chatRoom.count({ where: { ownerId: null } })
  const staleAdmins = await prisma.chatMember.count({ where: { role: "admin" } })

  console.log("=== Current state ===")
  console.log(`  ChatRoom    : ${roomCount}`)
  console.log(`  ChatMember  : ${memberCount}`)
  console.log(`  ChatMessage : ${msgCount}`)
  console.log(`  Missing ownerId : ${roomsMissingOwner}`)
  console.log(`  Stale admin roles : ${staleAdmins}\n`)

  if (roomsMissingOwner === 0 && staleAdmins === 0) {
    console.log("✅ All rooms already in v2 format. Nothing to do.")
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

  for (const room of roomsToFix) {
    // Pick owner: earliest "admin", else earliest "member"
    const ownerMember =
      room.members.find((m) => m.role === "admin") ??
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

  console.log(`\nFixed: ${fixed} | Skipped: ${skipped}`)

  if (!isDryRun) {
    const remaining = await prisma.chatRoom.count({ where: { ownerId: null } })
    const remainingAdmins = await prisma.chatMember.count({ where: { role: "admin" } })
    if (remaining === 0 && remainingAdmins === 0) {
      console.log("\n🎉 Migration complete.")
    } else {
      console.log(`\n⚠️  Still ${remaining} rooms missing ownerId, ${remainingAdmins} stale admins.`)
    }
  }
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
