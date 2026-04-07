-- Add controlSignal to WorkflowJob for pause/resume/stop support
ALTER TABLE "WorkflowJob" ADD COLUMN "controlSignal" TEXT;
