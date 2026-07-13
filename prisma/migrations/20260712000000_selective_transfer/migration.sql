ALTER TABLE "ServerHostLink" ADD COLUMN "includePaths" TEXT;
ALTER TABLE "ServerHostLink" DROP COLUMN "excludeConfig";
