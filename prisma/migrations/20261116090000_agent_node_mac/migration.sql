-- Wake-on-LAN for agent nodes: the agent reports its primary interface's MAC
-- on every sync; the dashboard stores it here and broadcasts a magic packet
-- before starting a server on an offline node (manual start, or at a
-- scheduled start's lead time).
ALTER TABLE "AgentNode" ADD COLUMN "macAddress" TEXT;
