import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runMigrations,
  computePending,
  listMigrations,
  splitStatements,
  checksum,
  formatStamp,
} from "../migrate.js";
import { PrismaClient } from "../../src/generated/client/index.js";

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function makeClient(dbUrl) {
  return new PrismaClient({ datasources: { db: { url: dbUrl } } });
}
function writeMigration(dir, name, sql) {
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.writeFileSync(path.join(dir, name, "migration.sql"), sql);
}

let work;
beforeEach(() => { work = tmpDir("rs-migtest-"); });
afterEach(() => { fs.rmSync(work, { recursive: true, force: true }); });

describe("pure helpers", () => {
  it("computePending returns names not yet applied, preserving order", () => {
    expect(computePending(["a", "b", "c"], ["a"])).toEqual(["b", "c"]);
    expect(computePending(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("splitStatements splits on semicolons and drops comment-only chunks", () => {
    const sql = `-- CreateTable\nCREATE TABLE "A" ("id" TEXT);\nALTER TABLE "A" ADD COLUMN "x" TEXT;\n`;
    expect(splitStatements(sql).length).toBe(2);
  });

  it("strips leading comment lines from emitted statements", () => {
    const stmts = splitStatements(`-- CreateTable\nCREATE TABLE "A" ("id" TEXT);`);
    expect(stmts.length).toBe(1);
    expect(stmts[0].startsWith("--")).toBe(false);
    expect(stmts[0]).toContain("CREATE TABLE");
  });

  it("a semicolon inside a comment line does not fracture the following statement", () => {
    // Shape of 20261022000002_pending_restart, which broke the v0.5.0 release build:
    // the old splitter emitted "cleared on the next start.\nALTER TABLE ..." as SQL.
    const sql =
      `-- Settings changed while the server was running; cleared on the next start.\n` +
      `ALTER TABLE "Server" ADD COLUMN "pendingRestart" BOOLEAN NOT NULL DEFAULT false;\n` +
      `-- Enrollment tokens are single-use; all-NULL hash column before enrollment.\n` +
      `CREATE TABLE "Node" ("id" TEXT NOT NULL PRIMARY KEY);\n`;
    const stmts = splitStatements(sql);
    expect(stmts).toEqual([
      `ALTER TABLE "Server" ADD COLUMN "pendingRestart" BOOLEAN NOT NULL DEFAULT false`,
      `CREATE TABLE "Node" ("id" TEXT NOT NULL PRIMARY KEY)`,
    ]);
  });

  it("checksum is a stable sha256 hex of the content", () => {
    expect(checksum("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("formatStamp produces YYYYMMDD-HHMMSS", () => {
    expect(formatStamp(new Date("2026-06-27T08:09:05Z"))).toMatch(/^\d{8}-\d{6}$/);
  });

  it("listMigrations returns sorted dirs that contain migration.sql", () => {
    const md = path.join(work, "m");
    writeMigration(md, "0002_b", "SELECT 1;");
    writeMigration(md, "0001_a", "SELECT 1;");
    fs.mkdirSync(path.join(md, "0003_empty"), { recursive: true }); // no migration.sql
    expect(listMigrations(md)).toEqual(["0001_a", "0002_b"]);
  });
});

describe("runMigrations", () => {
  const MIG_1 = `CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL);`;
  const MIG_2 = `ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER';\nCREATE TABLE "Thing" ("id" TEXT NOT NULL PRIMARY KEY);`;

  function migrationsFixture() {
    const md = path.join(work, "migrations");
    writeMigration(md, "0001_init", MIG_1);
    writeMigration(md, "0002_add", MIG_2);
    return md;
  }
  function opts(extra = {}) {
    let uuidN = 0;
    return {
      dbPath: path.join(work, "app.db"),
      migrationsDir: migrationsFixture(),
      makeClient,
      backupDir: path.join(work, "backups"),
      now: () => new Date("2026-06-27T08:09:05Z"),
      uuid: () => `00000000-0000-0000-0000-${String(uuidN++).padStart(12, "0")}`,
      log: { info() {} },
      ...extra,
    };
  }
  async function tablesOf(dbPath) {
    const db = makeClient("file:" + dbPath.replace(/\\/g, "/"));
    try {
      const rows = await db.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      return rows.map((r) => r.name);
    } finally { await db.$disconnect(); }
  }

  it("applies all migrations to an empty DB and records them; no backup for empty DB", async () => {
    const o = opts();
    const res = await runMigrations(o);
    expect(res.applied).toEqual(["0001_init", "0002_add"]);
    expect(res.backupPath).toBeNull();
    const tables = await tablesOf(o.dbPath);
    expect(tables).toContain("User");
    expect(tables).toContain("Thing");
    expect(tables).toContain("_prisma_migrations");
  });

  it("baselines an existing (v0.1.0-shaped) DB and applies only the delta, preserving data", async () => {
    const o = opts();
    // Pre-create a v0.1.0-shaped DB with one user row (no _prisma_migrations).
    const pre = makeClient("file:" + o.dbPath.replace(/\\/g, "/"));
    await pre.$executeRawUnsafe(MIG_1);
    await pre.$executeRawUnsafe(`INSERT INTO "User" ("id","email") VALUES ('u1','a@b.c')`);
    await pre.$disconnect();

    const res = await runMigrations(o);
    expect(res.applied).toEqual(["0002_add"]); // 0001 baselined (not re-run)
    expect(res.backupPath).not.toBeNull();
    expect(fs.existsSync(res.backupPath)).toBe(true);

    const db = makeClient("file:" + o.dbPath.replace(/\\/g, "/"));
    try {
      const users = await db.$queryRawUnsafe(`SELECT id, role FROM "User"`);
      expect(users).toEqual([{ id: "u1", role: "USER" }]); // row preserved, column added
      const applied = await db.$queryRawUnsafe(
        `SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name`
      );
      expect(applied.map((r) => r.migration_name)).toEqual(["0001_init", "0002_add"]);
    } finally { await db.$disconnect(); }
  });

  it("is a no-op on an already-migrated DB (no backup, nothing applied)", async () => {
    const o = opts();
    await runMigrations(o);             // first run applies
    const res = await runMigrations(opts({ dbPath: o.dbPath, migrationsDir: o.migrationsDir }));
    expect(res.applied).toEqual([]);
    expect(res.backupPath).toBeNull();
  });

  it("applies a SQLite table-rebuild migration on a populated table, preserving rows", async () => {
    const md = path.join(work, "rebuild-migrations");
    writeMigration(md, "0001_init", `CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL);`);
    writeMigration(
      md,
      "0002_rebuild",
      `-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'USER');
INSERT INTO "new_User" ("id", "email") SELECT "id", "email" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;`
    );
    const o = opts({ migrationsDir: md });
    // Pre-existing populated DB (v0.1.0-shaped: User table, no _prisma_migrations).
    const pre = makeClient("file:" + o.dbPath.replace(/\\/g, "/"));
    await pre.$executeRawUnsafe(`CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL)`);
    await pre.$executeRawUnsafe(`INSERT INTO "User" ("id","email") VALUES ('u1','a@b.c')`);
    await pre.$disconnect();

    const res = await runMigrations(o);
    expect(res.applied).toEqual(["0002_rebuild"]); // 0001 baselined, not re-run
    const db = makeClient("file:" + o.dbPath.replace(/\\/g, "/"));
    try {
      const rows = await db.$queryRawUnsafe(`SELECT id, email, role FROM "User"`);
      expect(rows).toEqual([{ id: "u1", email: "a@b.c", role: "USER" }]);
    } finally {
      await db.$disconnect();
    }
  });

  it("on a failing migration: rejects, preserves data, and keeps a backup", async () => {
    const o = opts();
    // existing DB with data so a backup is taken
    const pre = makeClient("file:" + o.dbPath.replace(/\\/g, "/"));
    await pre.$executeRawUnsafe(MIG_1);
    await pre.$executeRawUnsafe(`INSERT INTO "User" ("id","email") VALUES ('u1','a@b.c')`);
    await pre.$disconnect();
    // overwrite 0002 with invalid SQL
    fs.writeFileSync(path.join(o.migrationsDir, "0002_add", "migration.sql"), `CREATE TABLE "Bad" (`);

    await expect(runMigrations(o)).rejects.toThrow();
    const db = makeClient("file:" + o.dbPath.replace(/\\/g, "/"));
    try {
      const users = await db.$queryRawUnsafe(`SELECT id FROM "User"`);
      expect(users).toEqual([{ id: "u1" }]);           // data intact
      const things = await db.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='Thing'"
      );
      expect(things).toEqual([]);                       // failed migration rolled back
    } finally { await db.$disconnect(); }
    expect(fs.existsSync(path.join(o.backupDir))).toBe(true);
    expect(fs.readdirSync(o.backupDir).length).toBeGreaterThan(0);
  });
});
