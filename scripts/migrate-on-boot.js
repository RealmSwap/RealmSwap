"use strict";
// Container boot migration: bring the SQLite DB up to the latest schema before
// the Next server starts. Uses the same forward-only runner as the packaged
// Electron app so a Docker deployment converges to exactly the same schema.
// DATABASE_URL must be a file: URL (SQLite), e.g. file:/data/realmswap.db.
const path = require("path");
const fs = require("fs");
const { runMigrations } = require("../electron/migrate");
const { PrismaClient } = require("../src/generated/client");

const rawUrl = process.env.DATABASE_URL || "";
if (!rawUrl.startsWith("file:")) {
  console.error("[migrate-on-boot] DATABASE_URL must be a SQLite file: URL — refusing to start.");
  process.exit(1);
}
const dbPath = rawUrl.slice("file:".length);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

runMigrations({
  dbPath,
  migrationsDir: path.join(__dirname, "..", "prisma", "migrations"),
  backupDir: path.join(path.dirname(dbPath), ".migration-backups"),
  makeClient: (url) => new PrismaClient({ datasources: { db: { url } } }),
})
  .then((res) => {
    console.log(`[migrate-on-boot] Applied ${res.applied} pending migration(s).`);
  })
  .catch((err) => {
    console.error("[migrate-on-boot] Migration failed:", err);
    process.exit(1);
  });
