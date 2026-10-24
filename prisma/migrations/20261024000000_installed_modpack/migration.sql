-- The modpack a Minecraft server currently runs (one pack per server).
CREATE TABLE "InstalledModpack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "projectId" TEXT,
    "fileId" INTEGER,
    "fileName" TEXT,
    "packName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "mcVersion" TEXT,
    "loaderType" TEXT,
    "loaderVersion" TEXT,
    "packageIds" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstalledModpack_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- SQLite: adding a unique index on a new all-NULL column is safe (NULLs are distinct).
CREATE UNIQUE INDEX "InstalledModpack_serverId_key" ON "InstalledModpack"("serverId");
