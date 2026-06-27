"use strict";
// Forward-only DB migration runner for the packaged app. Applies pending
// Prisma migration SQL through the bundled query engine (no migrate engine /
// CLI bundled). All collaborators are injected so the logic is unit-testable.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function checksum(sql) {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

// Split Prisma-generated DDL into individual statements. Assumes statements are
// terminated by ';' with no embedded semicolons (true for generated migrations).
function splitStatements(sql) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

function listMigrations(migrationsDir, deps = {}) {
  const exists = deps.existsSync || fs.existsSync;
  const readdir = deps.readdirSync || fs.readdirSync;
  if (!exists(migrationsDir)) return [];
  return readdir(migrationsDir)
    .filter((name) => exists(path.join(migrationsDir, name, "migration.sql")))
    .sort();
}

function computePending(allNames, appliedNames) {
  const applied = new Set(appliedNames);
  return allNames.filter((n) => !applied.has(n));
}

function pad(n) {
  return String(n).padStart(2, "0");
}
function formatStamp(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

async function ensureMigrationsTable(db) {
  await db.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`
  );
}

async function tableExists(db, table) {
  const rows = await db.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    table
  );
  return rows.length > 0;
}

function recordOp(db, { name, sql, ts, uuid, steps }) {
  return db.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
     VALUES (?,?,?,?,?,?)`,
    uuid(),
    checksum(sql),
    ts,
    name,
    ts,
    steps
  );
}

async function runMigrations(opts) {
  const {
    dbPath,
    migrationsDir,
    makeClient,
    backupDir,
    copyFile = fs.copyFileSync,
    mkdir = fs.mkdirSync,
    readFile = fs.readFileSync,
    now = () => new Date(),
    uuid = crypto.randomUUID,
    log = console,
  } = opts;

  const dbUrl = "file:" + dbPath.replace(/\\/g, "/");
  const db = makeClient(dbUrl);
  try {
    await ensureMigrationsTable(db);
    const names = listMigrations(migrationsDir);
    const rows = await db.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
    );
    const applied = rows.map((r) => r.migration_name);

    // Baseline a pre-migrations existing install (has a User table, no history).
    if (applied.length === 0 && names.length > 0 && (await tableExists(db, "User"))) {
      const first = names[0];
      const sql = readFile(path.join(migrationsDir, first, "migration.sql"), "utf8");
      await recordOp(db, { name: first, sql, ts: now().toISOString(), uuid, steps: 0 });
      applied.push(first);
      if (log.info) log.info(`[migrate] baselined existing DB at ${first}`);
    }

    const pending = computePending(names, applied);
    if (pending.length === 0) return { applied: [], backupPath: null };

    // Back up only when there is pre-existing data/history to protect.
    let backupPath = null;
    if (applied.length > 0) {
      mkdir(backupDir, { recursive: true });
      backupPath = path.join(backupDir, `realmswap-pre-migration-${formatStamp(now())}.db`);
      copyFile(dbPath, backupPath);
    }

    const appliedNow = [];
    try {
      for (const name of pending) {
        const sql = readFile(path.join(migrationsDir, name, "migration.sql"), "utf8");
        const statements = splitStatements(sql);
        const ops = statements.map((s) => db.$executeRawUnsafe(s));
        ops.push(recordOp(db, { name, sql, ts: now().toISOString(), uuid, steps: statements.length }));
        await db.$transaction(ops);
        appliedNow.push(name);
        if (log.info) log.info(`[migrate] applied ${name} (${statements.length} statements)`);
      }
    } catch (err) {
      if (backupPath) err.backupPath = backupPath;
      throw err;
    }
    return { applied: appliedNow, backupPath };
  } finally {
    await db.$disconnect();
  }
}

module.exports = {
  runMigrations,
  computePending,
  listMigrations,
  splitStatements,
  checksum,
  formatStamp,
};
