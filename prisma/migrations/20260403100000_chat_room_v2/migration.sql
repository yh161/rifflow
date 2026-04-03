-- ─────────────────────────────────────────────────────────────
-- Chat room v2: add ownerId + joinPermission to ChatRoom
-- Promote existing admins → owner role
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "ChatRoom"
    ADD COLUMN IF NOT EXISTS "ownerId"        TEXT,
    ADD COLUMN IF NOT EXISTS "joinPermission" TEXT NOT NULL DEFAULT 'invite_only';

-- Back-fill ownerId: pick earliest "admin" member for each room
UPDATE "ChatRoom" cr
SET "ownerId" = (
    SELECT cm."userId"
    FROM "ChatMember" cm
    WHERE cm."roomId" = cr.id
      AND cm.role IN ('admin', 'owner')
    ORDER BY cm."joinedAt" ASC
    LIMIT 1
)
WHERE cr."ownerId" IS NULL;

-- Rename "admin" → "owner" for first member of each room (the creator)
UPDATE "ChatMember" cm
SET role = 'owner'
WHERE cm.role = 'admin'
  AND cm."userId" = (
      SELECT cr."ownerId" FROM "ChatRoom" cr WHERE cr.id = cm."roomId"
  );
