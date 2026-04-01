-- 将 Template.pricePerUse (Decimal) 替换为 priceInPoints (Int，积分制)
ALTER TABLE "Template" ADD COLUMN "priceInPoints" INTEGER;
UPDATE "Template" SET "priceInPoints" = ROUND("pricePerUse")::INTEGER WHERE "pricePerUse" IS NOT NULL;
ALTER TABLE "Template" DROP COLUMN "pricePerUse";

-- 将 TemplateExecution.cost (Decimal) 替换为 costInPoints (Int，积分制)
ALTER TABLE "TemplateExecution" ADD COLUMN "costInPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TemplateExecution" DROP COLUMN "cost";
