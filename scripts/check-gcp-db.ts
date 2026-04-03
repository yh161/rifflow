import { prisma } from "../lib/prisma"

async function main() {
  // Check existing DMs
  const dmCount = await prisma.directMessage.count()
  const pairs = await prisma.directMessage.findMany({
    select: { senderId: true, receiverId: true },
    distinct: ["senderId", "receiverId"],
  })

  // Check migration history
  const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at
  `

  console.log("=== GCP DB Status ===")
  console.log("DirectMessages total:", dmCount)
  console.log("Distinct conversation pairs:", pairs.length)
  if (pairs.length > 0) console.log("Pairs:", JSON.stringify(pairs, null, 2))
  console.log("\n=== Migrations applied ===")
  migrations.forEach(m => console.log(m.finished_at ? "✅" : "❌", m.migration_name))
}

main().catch(console.error).finally(() => prisma.$disconnect())
