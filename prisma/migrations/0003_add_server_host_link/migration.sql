-- CreateTable
CREATE TABLE "ServerHostLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'AKLIZ',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "remoteBasePath" TEXT NOT NULL DEFAULT '.',
    "excludeConfig" BOOLEAN NOT NULL DEFAULT false,
    "lastPushAt" DATETIME,
    "lastPullAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServerHostLink_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerHostLink_serverId_key" ON "ServerHostLink"("serverId");
