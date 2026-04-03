/**
 * One-time migration: DirectMessage → ChatRoom/ChatMember/ChatMessage
 *
 * Run with:
 *   npx tsx scripts/migrate-dm-to-rooms.ts
 *
 * Safe to run multiple times — skips rooms that already exist for a given pair.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🔄 Starting DirectMessage → ChatRoom migration...")

  // 1. Fetch all DMs ordered by time
  const allDMs = await prisma.directMessage.findMany({
    orderBy: { createdAt: "asc" },
  })

  if (allDMs.length === 0) {
    console.log("✅ No DirectMessages found. Nothing to migrate.")
    return
  }

  console.log(`📨 Found ${allDMs.length} messages to migrate.`)

  // 2. Group messages by conversation pair (canonical: smaller id first)
  const convMap = new Map<string, typeof allDMs>()

  for (const dm of allDMs) {
    const key =
      dm.senderId < dm.receiverId
        ? `${dm.senderId}__${dm.receiverId}`
        : `${dm.receiverId}__${dm.senderId}`

    if (!convMap.has(key)) convMap.set(key, [])
    convMap.get(key)!.push(dm)
  }

  console.log(`👥 Found ${convMap.size} unique conversations.`)

  let created = 0
  let skipped = 0

  for (const [key, messages] of convMap.entries()) {
    const [userAId, userBId] = key.split("__")

    // Check if a room already exists with exactly these two members
    const existing = await prisma.chatRoom.findFirst({
      where: {
        members: {
          every: { userId: { in: [userAId, userBId] } },
        },
        AND: {
          members: { some: { userId: userAId } },
        },
      },
      include: { members: true },
    })

    if (existing && existing.members.length === 2) {
      console.log(`  ⏭  Skipping pair ${key} — room already exists (${existing.id})`)
      skipped++
      continue
    }

    // Create room + members + messages in one transaction
    const firstMsg = messages[0]
    const createdAt = firstMsg.createdAt

    await prisma.$transaction(async (tx) => {
      // Create room
      const room = await tx.chatRoom.create({
        data: {
          createdAt,
          updatedAt: messages.at(-1)!.createdAt,
          members: {
            create: [
              { userId: userAId, role: "admin", joinedAt: createdAt },
              { userId: userBId, role: "member", joinedAt: createdAt },
            ],
          },
        },
      })

      // Migrate messages
      await tx.chatMessage.createMany({
        data: messages.map((dm) => ({
          roomId: room.id,
          senderId: dm.senderId,
          content: dm.content,
          isAI: dm.isAI ?? false,
          aiModel: dm.aiModel ?? null,
          createdAt: dm.createdAt,
        })),
      })

      console.log(
        `  ✅ Room ${room.id} — pair ${key} — ${messages.length} messages`
      )
    })

    created++
  }

  console.log(`\n🎉 Done! Created ${created} rooms, skipped ${skipped} existing.`)
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
