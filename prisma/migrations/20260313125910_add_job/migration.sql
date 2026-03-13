/*
  Warnings:

  - Made the column `results` on table `WorkflowJob` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "WorkflowJob" ALTER COLUMN "results" SET NOT NULL;
