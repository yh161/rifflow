-- CreateTable
CREATE TABLE "RiffDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodesJson" JSONB NOT NULL DEFAULT '[]',
    "edgesJson" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiffDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiffDraft_userId_key" ON "RiffDraft"("userId");

-- AddForeignKey
ALTER TABLE "RiffDraft" ADD CONSTRAINT "RiffDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
