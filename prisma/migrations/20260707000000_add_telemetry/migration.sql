-- CreateTable
CREATE TABLE "ServerTelemetry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "cpu" REAL NOT NULL,
    "ramMB" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerTelemetry_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ServerTelemetry_serverId_createdAt_idx" ON "ServerTelemetry"("serverId", "createdAt");
