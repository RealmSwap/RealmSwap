-- Delivery-channel configuration for alerts (SMTP + Discord webhook), one
-- singleton row, with delivery health (lastError/lastSentAt) so the Settings
-- UI can show whether notifications are actually going out.
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFrom" TEXT,
    "discordWebhook" TEXT,
    "lastError" TEXT,
    "lastSentAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
