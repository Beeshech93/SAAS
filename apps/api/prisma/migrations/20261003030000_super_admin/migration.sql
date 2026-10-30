-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: tamper-evident audit trail for Super Admin actions
CREATE TABLE "AuditLog" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "actorId"     UUID         NOT NULL,
    "action"      TEXT         NOT NULL,
    "targetType"  TEXT         NOT NULL,
    "targetId"    UUID,
    "description" TEXT         NOT NULL,
    "metadata"    JSONB,
    "ipAddress"   TEXT,
    "userAgent"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx"            ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx"             ON "AuditLog"("action");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_createdAt_idx"           ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
