-- Remote agent nodes: machines running the RealmSwap agent that host game
-- servers as sibling Docker containers, managed from this dashboard.
CREATE TABLE "AgentNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "enrollTokenHash" TEXT,
    "enrollExpiresAt" DATETIME,
    "secret" TEXT,
    "platform" TEXT,
    "arch" TEXT,
    "agentVersion" TEXT,
    "dockerVersion" TEXT,
    "lanIp" TEXT,
    "totalRamMB" INTEGER,
    "freeDiskGB" REAL,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Enrollment tokens are single-use; all-NULL hash column before enrollment.
CREATE UNIQUE INDEX "AgentNode_enrollTokenHash_key" ON "AgentNode"("enrollTokenHash");
CREATE INDEX "AgentNode_userId_idx" ON "AgentNode"("userId");

-- Work queue the agent drains on each sync (agent dials home; nothing inbound).
CREATE TABLE "AgentCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "completedAt" DATETIME
);

CREATE INDEX "AgentCommand_nodeId_status_idx" ON "AgentCommand"("nodeId", "status");
CREATE INDEX "AgentCommand_serverId_idx" ON "AgentCommand"("serverId");

-- Servers can be hosted on a remote agent node.
ALTER TABLE "Server" ADD COLUMN "nodeId" TEXT;
