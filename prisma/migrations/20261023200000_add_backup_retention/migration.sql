-- Add per-server snapshot retention (keep last N)
ALTER TABLE "Server" ADD COLUMN "backupRetention" INTEGER NOT NULL DEFAULT 20;
