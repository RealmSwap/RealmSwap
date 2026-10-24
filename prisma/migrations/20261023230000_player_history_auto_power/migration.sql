-- Player-count history + auto power settings + first-boot marker
ALTER TABLE "ServerTelemetry" ADD COLUMN "playerCount" INTEGER;
ALTER TABLE "ServerTelemetry" ADD COLUMN "maxPlayers" INTEGER;
ALTER TABLE "Server" ADD COLUMN "autoStartLeadMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Server" ADD COLUMN "idleStopEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Server" ADD COLUMN "idleStopMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Server" ADD COLUMN "sessionAutoStopHours" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Server" ADD COLUMN "firstOnlineAt" DATETIME;
