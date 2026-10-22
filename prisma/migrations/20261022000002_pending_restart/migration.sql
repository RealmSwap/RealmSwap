-- Settings changed while the server was running; cleared on the next start.
ALTER TABLE "Server" ADD COLUMN "pendingRestart" BOOLEAN NOT NULL DEFAULT false;
