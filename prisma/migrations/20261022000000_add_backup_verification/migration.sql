-- Backup restore-verification: when a backup archive was last proven
-- restorable (opened + entries decompressed), and the error if it wasn't.
ALTER TABLE "Backup" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "Backup" ADD COLUMN "verifyError" TEXT;
