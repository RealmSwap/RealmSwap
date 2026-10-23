-- Per-user offsite (S3) storage settings; accessKey/secretKey encrypted at rest by the app
CREATE TABLE "S3Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT,
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "bucket" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "S3Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Offsite upload outcome is recorded per backup row: null = never attempted
ALTER TABLE "Backup" ADD COLUMN "offsiteStatus" TEXT;
ALTER TABLE "Backup" ADD COLUMN "offsiteError" TEXT;
ALTER TABLE "Backup" ADD COLUMN "offsiteUploadedAt" DATETIME;

CREATE UNIQUE INDEX "S3Setting_userId_key" ON "S3Setting"("userId");
