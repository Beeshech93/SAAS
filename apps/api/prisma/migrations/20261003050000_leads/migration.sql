-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "email" TEXT,
    "otherEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "source" TEXT DEFAULT 'google_maps',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "notes" TEXT,
    "socialLinks" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");
CREATE INDEX "Lead_city_idx" ON "Lead"("city");
CREATE INDEX "Lead_category_idx" ON "Lead"("category");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

