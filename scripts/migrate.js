/**
 * Lightweight migration runner — replaces `prisma migrate deploy` at startup.
 * Uses the `postgres` package (bundled with Prisma) to run SQL migration files
 * and tracks applied migrations in `_prisma_migrations` (Prisma-compatible format).
 *
 * Run: node scripts/migrate.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Use postgres package (in /app/node_modules/postgres, Node resolves up the tree)
const postgres = require("postgres");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] ERROR: DATABASE_URL not set");
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, "prisma", "migrations");

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, ssl: false, connect_timeout: 10 });

  try {
    // Ensure _prisma_migrations table exists (Prisma-compatible)
    await sql`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id                      VARCHAR(36)  NOT NULL PRIMARY KEY,
        checksum                VARCHAR(64)  NOT NULL,
        finished_at             TIMESTAMPTZ,
        migration_name          TEXT         NOT NULL,
        logs                    TEXT,
        rolled_back_at          TIMESTAMPTZ,
        started_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        applied_steps_count     INTEGER      NOT NULL DEFAULT 0
      )
    `;

    // Get already-applied migrations
    const applied = await sql`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    const appliedSet = new Set(applied.map((r) => r.migration_name));

    // Read migration directories in order
    const dirs = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((d) => {
        const full = path.join(MIGRATIONS_DIR, d);
        return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "migration.sql"));
      })
      .sort();

    for (const dir of dirs) {
      if (appliedSet.has(dir)) {
        console.log(`[migrate] already applied: ${dir}`);
        continue;
      }

      const sqlFile = path.join(MIGRATIONS_DIR, dir, "migration.sql");
      const sqlText = fs.readFileSync(sqlFile, "utf8");
      const checksum = crypto.createHash("sha256").update(sqlText).digest("hex");
      const id = crypto.randomUUID();

      console.log(`[migrate] applying: ${dir}`);

      await sql`
        INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at)
        VALUES (${id}, ${checksum}, ${dir}, NOW())
      `;

      try {
        // Run the migration SQL (may contain multiple statements)
        await sql.unsafe(sqlText);

        await sql`
          UPDATE "_prisma_migrations"
          SET finished_at = NOW(), applied_steps_count = 1
          WHERE id = ${id}
        `;
        console.log(`[migrate] applied:  ${dir}`);
      } catch (err) {
        await sql`
          UPDATE "_prisma_migrations"
          SET logs = ${err.message}, rolled_back_at = NOW()
          WHERE id = ${id}
        `;
        console.error(`[migrate] FAILED:  ${dir}`, err.message);
        await sql.end();
        process.exit(1);
      }
    }

    console.log("[migrate] all migrations up to date");
    await sql.end();
  } catch (err) {
    console.error("[migrate] unexpected error:", err);
    await sql.end();
    process.exit(1);
  }
}

main();
