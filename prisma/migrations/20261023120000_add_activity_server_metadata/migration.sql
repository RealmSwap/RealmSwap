ALTER TABLE "ActivityLog" ADD COLUMN "serverId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "metadata" TEXT;

CREATE INDEX "ActivityLog_serverId_createdAt_idx" ON "ActivityLog"("serverId", "createdAt");
