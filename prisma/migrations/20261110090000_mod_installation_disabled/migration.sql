-- ModInstallation.disabled has been in schema.prisma since per-mod
-- enable/disable landed, but no migration ever created the column. Databases
-- built from migrations (the installer's template.db and every upgraded
-- install) therefore lack it, and any query that reads or writes a mod row
-- fails with "The column main.ModInstallation.disabled does not exist". Dev
-- and the e2e harnesses build their schema with `prisma db push`, which is
-- why nothing caught it.
ALTER TABLE "ModInstallation" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
