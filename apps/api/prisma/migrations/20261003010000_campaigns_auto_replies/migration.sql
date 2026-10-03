-- CreateEnum
CREATE TYPE "AutoReplyTrigger" AS ENUM ('KEYWORD', 'WELCOME', 'AWAY');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AutoReplyRule" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "AutoReplyTrigger" NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reply" TEXT NOT NULL,
    "activeFrom" TEXT,
    "activeTo" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReplyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recentDays" INTEGER,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoReplyRule_businessId_active_idx" ON "AutoReplyRule"("businessId", "active");

-- CreateIndex
CREATE INDEX "Campaign_businessId_createdAt_idx" ON "Campaign"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_customerId_key" ON "CampaignRecipient"("campaignId", "customerId");

-- AddForeignKey
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

