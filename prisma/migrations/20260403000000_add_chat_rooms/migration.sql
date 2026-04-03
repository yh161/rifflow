-- ─────────────────────────────────────────────────────────────
-- Patch DirectMessage: add isAI + aiModel (may already exist locally)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "DirectMessage"
    ADD COLUMN IF NOT EXISTS "isAI"    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "aiModel" TEXT;

-- ─────────────────────────────────────────────────────────────
-- Patch RiffDraft: add viewportJson (may already exist locally)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "RiffDraft"
    ADD COLUMN IF NOT EXISTS "viewportJson" JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}';

-- ─────────────────────────────────────────────────────────────
-- ChatRoom
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChatRoom" (
    "id"        TEXT         NOT NULL,
    "name"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────
-- ChatMember
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChatMember" (
    "id"         TEXT         NOT NULL,
    "roomId"     TEXT         NOT NULL,
    "userId"     TEXT         NOT NULL,
    "role"       TEXT         NOT NULL DEFAULT 'member',
    "joinedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMember_roomId_userId_key"
    ON "ChatMember"("roomId", "userId");

CREATE INDEX IF NOT EXISTS "ChatMember_userId_idx"
    ON "ChatMember"("userId");

-- ─────────────────────────────────────────────────────────────
-- ChatMessage
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id"        TEXT         NOT NULL,
    "roomId"    TEXT         NOT NULL,
    "senderId"  TEXT,
    "content"   TEXT         NOT NULL,
    "isAI"      BOOLEAN      NOT NULL DEFAULT false,
    "aiModel"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatMessage_roomId_createdAt_idx"
    ON "ChatMessage"("roomId", "createdAt");

-- ─────────────────────────────────────────────────────────────
-- Foreign keys
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "ChatMember"
    ADD CONSTRAINT "ChatMember_roomId_fkey"
        FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMember"
    ADD CONSTRAINT "ChatMember_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_roomId_fkey"
        FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_senderId_fkey"
        FOREIGN KEY ("senderId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
