-- Add visibility fields to Template
ALTER TABLE "Template"
  ADD COLUMN IF NOT EXISTS "visibility"     TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS "visibilityList" TEXT[] NOT NULL DEFAULT '{}';
