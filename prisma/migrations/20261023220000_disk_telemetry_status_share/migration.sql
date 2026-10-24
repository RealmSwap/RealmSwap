-- Real disk telemetry + public status share links
ALTER TABLE "ServerTelemetry" ADD COLUMN "diskMB" DOUBLE PRECISION;
ALTER TABLE "Server" ADD COLUMN "statusShareCode" TEXT;
CREATE UNIQUE INDEX "Server_statusShareCode_key" ON "Server"("statusShareCode");
