-- Join Info used to read "Router answers UPnP" off any public-IP lookup
-- while the router had actually refused the mapping. Persist the start-time
-- outcome (LocalRunner writes it) so the connectivity check can tell the
-- truth: true = accepted, false = refused / no gateway, null = not attempted
-- since this column landed.
ALTER TABLE "Server" ADD COLUMN "upnpMapped" BOOLEAN;
