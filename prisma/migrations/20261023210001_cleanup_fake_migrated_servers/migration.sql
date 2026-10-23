-- The removed cloud-migration stub wrote runnerType "REMOTE" (a value the
-- runner factory never recognized — it silently fell back to LocalRunner) and
-- region "Cloud (Migrated)" while nothing actually moved. Those rows were
-- always running locally; restore them to the honest local state.
UPDATE "Server" SET "runnerType" = 'LOCAL' WHERE "runnerType" = 'REMOTE';
UPDATE "Server" SET "region" = 'LOCALHOST' WHERE "region" = 'Cloud (Migrated)';
