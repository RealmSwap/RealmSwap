-- CreateTable
CREATE TABLE "ModInstallation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dependencies" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModInstallation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "gameVersion" TEXT,
    "modCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerSnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "broadcastMsg" TEXT,
    "broadcastMin" INTEGER,
    "lastRunAt" DATETIME,
    "lastBroadcastAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledTask_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketplaceTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "gameSlug" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "dislikes" INTEGER NOT NULL DEFAULT 0,
    "verifiedLevel" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "payload" TEXT NOT NULL,
    "customDefSpec" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TemplateVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateVote_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketplaceTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "ramAllocation" REAL NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "runnerType" TEXT NOT NULL DEFAULT 'CLOUD',
    "localPath" TEXT,
    "pid" INTEGER,
    "password" TEXT,
    "enableUpnp" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "definitionId" TEXT,
    "paramValues" TEXT,
    "healthStatus" TEXT NOT NULL DEFAULT 'OK',
    "cpuUsage" REAL NOT NULL DEFAULT 0,
    "memoryUsage" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "snapshotInterval" INTEGER NOT NULL DEFAULT 0,
    "lastSnapshotAt" DATETIME,
    CONSTRAINT "Server_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Server_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "GameDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Server" ("cpuUsage", "createdAt", "definitionId", "enableUpnp", "game", "id", "ipAddress", "lastSnapshotAt", "localPath", "memoryUsage", "name", "paramValues", "password", "pid", "port", "ramAllocation", "region", "runnerType", "snapshotInterval", "status", "updatedAt", "userId") SELECT "cpuUsage", "createdAt", "definitionId", "enableUpnp", "game", "id", "ipAddress", "lastSnapshotAt", "localPath", "memoryUsage", "name", "paramValues", "password", "pid", "port", "ramAllocation", "region", "runnerType", "snapshotInterval", "status", "updatedAt", "userId" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ModInstallation_serverId_provider_packageId_key" ON "ModInstallation"("serverId", "provider", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVote_userId_templateId_key" ON "TemplateVote"("userId", "templateId");

