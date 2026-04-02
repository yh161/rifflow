-- CreateTable: Follow
CREATE TABLE IF NOT EXISTS "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DirectMessage
CREATE TABLE IF NOT EXISTS "DirectMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RiffDraftSnapshot
CREATE TABLE IF NOT EXISTS "RiffDraftSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodesJson" JSONB NOT NULL DEFAULT '[]',
    "edgesJson" JSONB NOT NULL DEFAULT '[]',
    "viewportJson" JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRedo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RiffDraftSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");
CREATE INDEX IF NOT EXISTS "Follow_followingId_idx" ON "Follow"("followingId");
CREATE INDEX IF NOT EXISTS "DirectMessage_senderId_receiverId_idx" ON "DirectMessage"("senderId", "receiverId");
CREATE INDEX IF NOT EXISTS "DirectMessage_receiverId_senderId_idx" ON "DirectMessage"("receiverId", "senderId");
CREATE INDEX IF NOT EXISTS "RiffDraftSnapshot_userId_createdAt_idx" ON "RiffDraftSnapshot"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey"
    FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey"
    FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_receiverId_fkey"
    FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RiffDraftSnapshot" ADD CONSTRAINT "RiffDraftSnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: drop inviteVerified (added by previous migration but removed from schema)
ALTER TABLE "User" DROP COLUMN IF EXISTS "inviteVerified";
