-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "onboardedAt" TIMESTAMP(3);


-- Businesses that already existed before the wizard do not need to go through it.
UPDATE "Business" SET "onboardedAt" = NOW();
