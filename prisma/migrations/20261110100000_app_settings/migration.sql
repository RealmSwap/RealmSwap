-- Install-wide settings, one row per key: choices that belong to this machine
-- rather than to a user or a server. Power behavior (keep-awake, wake timers)
-- is the first tenant.
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
