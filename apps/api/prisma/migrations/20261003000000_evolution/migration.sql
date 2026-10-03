-- CreateEnum
CREATE TYPE "WhatsAppProviderType" AS ENUM ('CLOUD_API', 'EVOLUTION');

-- AlterTable
ALTER TABLE "WhatsAppIntegration" ADD COLUMN     "provider" "WhatsAppProviderType" NOT NULL DEFAULT 'CLOUD_API',
ADD COLUMN     "baseUrl" TEXT,
ADD COLUMN     "instanceName" TEXT,
ADD COLUMN     "webhookSecret" TEXT;
