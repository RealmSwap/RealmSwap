-- The LOCAL runner used to force-map router ports for every local server
-- regardless of the toggle (`enableUpnp || runnerType === "LOCAL"`), so every
-- existing row has been mapped in practice even where the flag reads false.
-- Flip those rows to match lived behavior; from this migration on the stored
-- flag is authoritative and an explicit OFF is finally honored.
UPDATE "Server" SET "enableUpnp" = 1 WHERE "runnerType" = 'LOCAL' AND "enableUpnp" = 0;
