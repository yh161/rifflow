-- Add workflow job support to existing tables
-- This migration extends the Job table and creates WorkflowJob table

-- Add new columns to Job table for workflow support
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "workflowJobId" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "nodeId" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "dependsOn" TEXT[] DEFAULT '{}';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "inputData" JSONB;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "outputData" JSONB;

-- Create index for workflow job queries
CREATE INDEX IF NOT EXISTS "Job_workflowJobId_idx" ON "Job"("workflowJobId");
CREATE INDEX IF NOT EXISTS "Job_nodeId_idx" ON "Job"("nodeId");

-- Create WorkflowJob table
CREATE TABLE "WorkflowJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalNodes" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowJob_pkey" PRIMARY KEY ("id")
);

-- Create indexes for WorkflowJob
CREATE INDEX "WorkflowJob_userId_idx" ON "WorkflowJob"("userId");
CREATE INDEX "WorkflowJob_status_idx" ON "WorkflowJob"("status");

-- Add foreign key constraint
ALTER TABLE "WorkflowJob" ADD CONSTRAINT "WorkflowJob_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update Job foreign key to reference WorkflowJob
ALTER TABLE "Job" ADD CONSTRAINT "Job_workflowJobId_fkey" 
    FOREIGN KEY ("workflowJobId") REFERENCES "WorkflowJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;