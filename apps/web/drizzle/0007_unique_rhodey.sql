-- First, update any NULL values to false
UPDATE "character" SET "is_ignored" = false WHERE "is_ignored" IS NULL;

-- Then add the NOT NULL constraint
ALTER TABLE "character" ALTER COLUMN "is_ignored" SET NOT NULL;