-- Overnight update window: which local hour to run SteamCMD updates for
-- stopped servers, and when the last run happened (dedupe within a day).
ALTER TABLE "Server" ADD COLUMN "autoUpdateHour" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Server" ADD COLUMN "lastAutoUpdateAt" DATETIME;
