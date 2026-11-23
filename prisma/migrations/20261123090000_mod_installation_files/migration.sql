-- Windrose pak installs drop several differently-named files (000_*_P.pak /
-- .ucas / .utoc) flat into R5/Content/Paks/~mods, where other mods' files
-- live too — removal and disable/enable need the exact list, so the row
-- carries it as JSON. Schema/migration split note: dev and the e2e
-- harnesses build with `prisma db push`; packaged installs run the
-- migrations (same split as 20261110090000_mod_installation_disabled).
ALTER TABLE "ModInstallation" ADD COLUMN "files" TEXT;
