# Server Transfer to Hosting Provider (Akliz SFTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user mirror a server's full file tree (world + config + mods) both directions between the local install and a remote hosting provider over SFTP, with Akliz as the first provider.

**Architecture:** A `HostingProvider` abstraction (first impl: Akliz over SFTP) plus a per-server `ServerHostLink` record holding connection details with the password encrypted at rest. A pure sync **planner** decides which files move (skipping unchanged files by size+mtime and an ignore list); a thin **executor** runs the plan through an injectable `SftpClient`, reporting progress through the existing per-server progress store. A dependency-injected orchestration service (`executeTransfer`) wires planner + executor + DB + runner together so it is unit-testable without a network.

**Tech Stack:** TypeScript, Next.js 14 API routes, Prisma (SQLite), Electron `safeStorage` (with an AES-256-GCM dev fallback), `ssh2-sftp-client`, vitest, React + Tailwind + lucide-react.

## Global Constraints

- Platform: Windows (the app's runners and paths are Windows-first). Use POSIX-style forward-slash paths for *remote* SFTP paths and for the relative paths used inside the engine.
- Test runner: `vitest` (`npm test` = `vitest run`). Tests live next to code under `__tests__/` directories.
- DB: Prisma SQLite. Dev applies schema via `npm run db:push`; the packaged app applies SQL from `prisma/migrations/<name>/migration.sql` on startup (bundled to `migrations/` by `electron-builder.yml`). Every schema change needs BOTH.
- Data set: full server (world + config + mods). Mapping = whole-tree mirror of `local-servers/<serverId>/` ↔ remote base path.
- Incrementality: skip a file when destination has the same `relPath` AND equal `size` AND destination `mtimeMs >= source mtimeMs`.
- **No deletes in v1.** Transfers are additive/overwrite only — never remove files on either side.
- Default ignore list (exact constant): `["logs/", "crash-reports/", "cache/", "**/session.lock", "realm.json", ".secret.key"]`. When a link's `excludeConfig` is true, also ignore `"server.properties"`.
- Encrypted-secret blob format: `v1:safe:<base64>` (Electron safeStorage) or `v1:aes:<base64(iv|authTag|ciphertext)>` (AES-256-GCM, 12-byte IV). The plaintext password is NEVER returned to the client.
- Auth: every route calls `getAuthenticatedUser()` then `verifyServerAccess(serverId, user.id)`; 401 / 404 respectively on failure. Match the existing route style in `src/app/api/servers/[id]/backups/settings/route.ts`.

---

### Task 1: Add `ServerHostLink` schema, migration, and regenerate the Prisma client

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0003_add_server_host_link/migration.sql`

**Interfaces:**
- Produces: a `ServerHostLink` Prisma model and `prisma.serverHostLink` client accessor used by Tasks 6 and 7. Fields: `id, serverId (unique), provider, host, port, username, secret, remoteBasePath, excludeConfig, lastPushAt?, lastPullAt?, lastError?, createdAt, updatedAt`.

- [ ] **Step 1: Add the model to the Prisma schema**

In `prisma/schema.prisma`, add `hostLink ServerHostLink?` to the `Server` model's relation list (next to `backups Backup[]`), then append this model after the `Server` model:

```prisma
model ServerHostLink {
  id             String    @id @default(cuid())
  serverId       String    @unique
  server         Server    @relation(fields: [serverId], references: [id], onDelete: Cascade)
  provider       String    @default("AKLIZ")
  host           String
  port           Int       @default(22)
  username       String
  secret         String
  remoteBasePath String    @default(".")
  excludeConfig  Boolean   @default(false)
  lastPushAt     DateTime?
  lastPullAt     DateTime?
  lastError      String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

- [ ] **Step 2: Write the packaged migration SQL**

Create `prisma/migrations/0003_add_server_host_link/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "ServerHostLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'AKLIZ',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "remoteBasePath" TEXT NOT NULL DEFAULT '.',
    "excludeConfig" BOOLEAN NOT NULL DEFAULT false,
    "lastPushAt" DATETIME,
    "lastPullAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServerHostLink_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerHostLink_serverId_key" ON "ServerHostLink"("serverId");
```

- [ ] **Step 3: Validate, regenerate the client, and push to the dev DB**

Run: `npx prisma validate && npx prisma generate && npm run db:push`
Expected: prisma validate prints "The schema at prisma\schema.prisma is valid"; generate succeeds; db:push prints "Your database is now in sync with your Prisma schema."

- [ ] **Step 4: Verify the generated client exposes the new model**

Run: `node -e "const {PrismaClient}=require('./src/generated/client'); console.log(typeof new PrismaClient().serverHostLink.findUnique)"`
Expected: prints `function`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/0003_add_server_host_link/migration.sql src/generated/client
git commit -m "feat(hosting): add ServerHostLink model and migration"
```

---

### Task 2: Encrypted secret store

**Files:**
- Create: `src/lib/hosting/secretStore.ts`
- Test: `src/lib/hosting/__tests__/secretStore.test.ts`

**Interfaces:**
- Consumes: `dataRoot()` from `src/lib/appPaths.ts`.
- Produces: `encryptSecret(plain: string): string` and `decryptSecret(blob: string): string`. Used by Tasks 6 and 7. In dev/test (no Electron runtime) the AES path is used automatically because `require("electron")` outside Electron returns the binary path string, not the `safeStorage` API.

- [ ] **Step 1: Write the failing test**

Create `src/lib/hosting/__tests__/secretStore.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

let encryptSecret: typeof import("../secretStore").encryptSecret;
let decryptSecret: typeof import("../secretStore").decryptSecret;

beforeAll(async () => {
  // Point dataRoot at a temp dir so the AES keyfile is isolated.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-secret-"));
  process.env.GAMEVAULT_DATA_DIR = dir;
  const mod = await import("../secretStore");
  encryptSecret = mod.encryptSecret;
  decryptSecret = mod.decryptSecret;
});

describe("secretStore", () => {
  it("round-trips a secret through the AES fallback", () => {
    const plain = "hunter2-correct-horse";
    const blob = encryptSecret(plain);
    expect(blob.startsWith("v1:aes:")).toBe(true);
    expect(blob).not.toContain(plain);
    expect(decryptSecret(blob)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("throws on an unknown blob tag", () => {
    expect(() => decryptSecret("v9:bogus:abcd")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- secretStore`
Expected: FAIL — cannot resolve `../secretStore`.

- [ ] **Step 3: Implement the secret store**

Create `src/lib/hosting/secretStore.ts`:

```ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { dataRoot } from "@/lib/appPaths";

// Electron's safeStorage is only a real API when running inside the Electron
// main process. Outside it (dev `next`, vitest), require("electron") returns the
// path string to the binary, so `safeStorage` is undefined and we fall back to
// AES with a locally persisted key.
function getSafeStorage(): { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    const ss = electron && electron.safeStorage;
    if (ss && typeof ss.isEncryptionAvailable === "function" && ss.isEncryptionAvailable()) {
      return ss;
    }
  } catch {
    /* not in Electron */
  }
  return null;
}

function keyPath(): string {
  return path.join(dataRoot(), ".secret.key");
}

function getOrCreateAesKey(): Buffer {
  const p = keyPath();
  if (fs.existsSync(p)) {
    return fs.readFileSync(p);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(p, key, { mode: 0o600 });
  return key;
}

export function encryptSecret(plain: string): string {
  const ss = getSafeStorage();
  if (ss) {
    return "v1:safe:" + ss.encryptString(plain).toString("base64");
  }
  const key = getOrCreateAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v1:aes:" + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(blob: string): string {
  if (blob.startsWith("v1:safe:")) {
    const ss = getSafeStorage();
    if (!ss) throw new Error("safeStorage unavailable to decrypt this secret");
    return ss.decryptString(Buffer.from(blob.slice("v1:safe:".length), "base64"));
  }
  if (blob.startsWith("v1:aes:")) {
    const raw = Buffer.from(blob.slice("v1:aes:".length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const key = getOrCreateAesKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }
  throw new Error("Unrecognized secret blob format");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- secretStore`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hosting/secretStore.ts src/lib/hosting/__tests__/secretStore.test.ts
git commit -m "feat(hosting): add encrypted secret store with AES dev fallback"
```

---

### Task 3: Hosting types and the pure transfer planner

**Files:**
- Create: `src/lib/hosting/types.ts`
- Create: `src/lib/hosting/syncEngine.ts`
- Test: `src/lib/hosting/__tests__/syncEngine.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `type TransferDirection = "PUSH" | "PULL"`
  - `interface FileEntry { relPath: string; size: number; mtimeMs: number; isDir: boolean }` (`relPath` is POSIX, relative to the tree root, e.g. `"world/level.dat"`)
  - `interface TransferOp { type: "mkdir" | "copy"; relPath: string }`
  - `interface TransferPlan { ops: TransferOp[] }`
  - `interface TransferSummary { filesTransferred: number; bytesTransferred: number; failures: { relPath: string; error: string }[] }`
  - `interface SftpClient { connect(): Promise<void>; list(remoteDir: string): Promise<FileEntry[]>; mkdir(remoteDir: string): Promise<void>; put(localPath: string, remotePath: string): Promise<void>; get(remotePath: string, localPath: string): Promise<void>; end(): Promise<void> }`
  - `interface HostCredentials { host: string; port: number; username: string; password: string; remoteBasePath: string }`
  - `interface Transferer { mkdir(relPath: string): Promise<void>; copy(relPath: string): Promise<void> }`
  - `interface HostingProvider { id: string; displayName: string; validateCredentials(c: HostCredentials): string | null; createClient(c: HostCredentials): SftpClient }`
  - `const DEFAULT_IGNORE: string[]`
- Produces (syncEngine.ts):
  - `isIgnored(relPath: string, ignore: string[]): boolean`
  - `planTransfer(source: FileEntry[], dest: FileEntry[], ignore: string[]): TransferPlan`

- [ ] **Step 1: Write the types file**

Create `src/lib/hosting/types.ts`:

```ts
export type TransferDirection = "PUSH" | "PULL";

export interface FileEntry {
  relPath: string; // POSIX, relative to the tree root
  size: number;
  mtimeMs: number;
  isDir: boolean;
}

export interface TransferOp {
  type: "mkdir" | "copy";
  relPath: string;
}

export interface TransferPlan {
  ops: TransferOp[];
}

export interface TransferSummary {
  filesTransferred: number;
  bytesTransferred: number;
  failures: { relPath: string; error: string }[];
}

export interface SftpClient {
  connect(): Promise<void>;
  list(remoteDir: string): Promise<FileEntry[]>;
  mkdir(remoteDir: string): Promise<void>;
  put(localPath: string, remotePath: string): Promise<void>;
  get(remotePath: string, localPath: string): Promise<void>;
  end(): Promise<void>;
}

export interface HostCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  remoteBasePath: string;
}

export interface Transferer {
  mkdir(relPath: string): Promise<void>;
  copy(relPath: string): Promise<void>;
}

export interface HostingProvider {
  id: string;
  displayName: string;
  validateCredentials(c: HostCredentials): string | null;
  createClient(c: HostCredentials): SftpClient;
}

export const DEFAULT_IGNORE: string[] = [
  "logs/",
  "crash-reports/",
  "cache/",
  "**/session.lock",
  "realm.json",
  ".secret.key",
];
```

- [ ] **Step 2: Write the failing planner test**

Create `src/lib/hosting/__tests__/syncEngine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planTransfer, isIgnored } from "../syncEngine";
import { DEFAULT_IGNORE, FileEntry } from "../types";

const f = (relPath: string, size: number, mtimeMs: number): FileEntry => ({ relPath, size, mtimeMs, isDir: false });
const d = (relPath: string): FileEntry => ({ relPath, size: 0, mtimeMs: 0, isDir: true });

describe("isIgnored", () => {
  it("matches directory prefixes", () => {
    expect(isIgnored("logs/latest.log", DEFAULT_IGNORE)).toBe(true);
    expect(isIgnored("logs", DEFAULT_IGNORE)).toBe(true);
  });
  it("matches basename globs", () => {
    expect(isIgnored("world/session.lock", DEFAULT_IGNORE)).toBe(true);
  });
  it("matches exact filenames", () => {
    expect(isIgnored("realm.json", DEFAULT_IGNORE)).toBe(true);
  });
  it("does not match unrelated paths", () => {
    expect(isIgnored("world/level.dat", DEFAULT_IGNORE)).toBe(false);
  });
});

describe("planTransfer", () => {
  it("copies files missing on the destination", () => {
    const plan = planTransfer([f("world/level.dat", 10, 100)], [], []);
    expect(plan.ops).toContainEqual({ type: "copy", relPath: "world/level.dat" });
  });

  it("creates destination directories that are absent", () => {
    const plan = planTransfer([d("world"), f("world/level.dat", 10, 100)], [], []);
    const mkdirs = plan.ops.filter((o) => o.type === "mkdir").map((o) => o.relPath);
    expect(mkdirs).toContain("world");
    // mkdir ops sort before copies
    expect(plan.ops[0].type).toBe("mkdir");
  });

  it("skips files that are unchanged (same size, dest not older)", () => {
    const plan = planTransfer([f("a.txt", 5, 100)], [f("a.txt", 5, 100)], []);
    expect(plan.ops.find((o) => o.relPath === "a.txt")).toBeUndefined();
  });

  it("copies when size differs", () => {
    const plan = planTransfer([f("a.txt", 6, 100)], [f("a.txt", 5, 100)], []);
    expect(plan.ops).toContainEqual({ type: "copy", relPath: "a.txt" });
  });

  it("copies when source is newer than destination", () => {
    const plan = planTransfer([f("a.txt", 5, 200)], [f("a.txt", 5, 100)], []);
    expect(plan.ops).toContainEqual({ type: "copy", relPath: "a.txt" });
  });

  it("does not re-copy when destination is newer", () => {
    const plan = planTransfer([f("a.txt", 5, 100)], [f("a.txt", 5, 200)], []);
    expect(plan.ops.find((o) => o.relPath === "a.txt")).toBeUndefined();
  });

  it("excludes ignored paths from the plan", () => {
    const plan = planTransfer([f("logs/x.log", 5, 100), f("world/level.dat", 5, 100)], [], DEFAULT_IGNORE);
    const paths = plan.ops.map((o) => o.relPath);
    expect(paths).not.toContain("logs/x.log");
    expect(paths).toContain("world/level.dat");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- syncEngine`
Expected: FAIL — cannot resolve `../syncEngine`.

- [ ] **Step 4: Implement the planner**

Create `src/lib/hosting/syncEngine.ts`:

```ts
import { FileEntry, TransferOp, TransferPlan } from "./types";

// Ignore patterns:
//   "dir/"     -> matches the dir itself and anything beneath it
//   "**/name"  -> matches any path whose basename is `name`
//   "name"     -> matches that exact relPath
export function isIgnored(relPath: string, ignore: string[]): boolean {
  const base = relPath.split("/").pop() || relPath;
  for (const pat of ignore) {
    if (pat.endsWith("/")) {
      const dir = pat.slice(0, -1);
      if (relPath === dir || relPath.startsWith(dir + "/")) return true;
    } else if (pat.startsWith("**/")) {
      if (base === pat.slice(3)) return true;
    } else if (relPath === pat) {
      return true;
    }
  }
  return false;
}

export function planTransfer(source: FileEntry[], dest: FileEntry[], ignore: string[]): TransferPlan {
  const destByPath = new Map(dest.map((e) => [e.relPath, e]));
  const mkdirs: TransferOp[] = [];
  const copies: TransferOp[] = [];

  for (const entry of source) {
    if (isIgnored(entry.relPath, ignore)) continue;

    if (entry.isDir) {
      if (!destByPath.has(entry.relPath)) {
        mkdirs.push({ type: "mkdir", relPath: entry.relPath });
      }
      continue;
    }

    const existing = destByPath.get(entry.relPath);
    const unchanged = existing && existing.size === entry.size && existing.mtimeMs >= entry.mtimeMs;
    if (!unchanged) {
      copies.push({ type: "copy", relPath: entry.relPath });
    }
  }

  // Shallow-to-deep so parent dirs are created before their children.
  mkdirs.sort((a, b) => a.relPath.split("/").length - b.relPath.split("/").length || a.relPath.localeCompare(b.relPath));
  copies.sort((a, b) => a.relPath.localeCompare(b.relPath));

  return { ops: [...mkdirs, ...copies] };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- syncEngine`
Expected: PASS (all planner + isIgnored tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/hosting/types.ts src/lib/hosting/syncEngine.ts src/lib/hosting/__tests__/syncEngine.test.ts
git commit -m "feat(hosting): add transfer types and pure transfer planner"
```

---

### Task 4: Transfer executor (`runTransfer`)

**Files:**
- Modify: `src/lib/hosting/syncEngine.ts`
- Modify: `src/lib/hosting/__tests__/syncEngine.test.ts`

**Interfaces:**
- Consumes: `TransferPlan`, `Transferer`, `TransferSummary` from `types.ts`.
- Produces: `runTransfer(plan: TransferPlan, transferer: Transferer, sizes: Map<string, number>, onProgress: (done: number, total: number, label: string) => void): Promise<TransferSummary>`. Used by Task 6. Mkdir failures and copy failures are collected into `summary.failures`; the run never throws for a per-file error.

- [ ] **Step 1: Add the failing executor test**

Append to `src/lib/hosting/__tests__/syncEngine.test.ts`:

```ts
import { runTransfer } from "../syncEngine";
import { Transferer, TransferPlan } from "../types";

function fakeTransferer(failOn: string[] = []) {
  const calls: string[] = [];
  const t: Transferer = {
    async mkdir(rel) { calls.push("mkdir:" + rel); },
    async copy(rel) {
      calls.push("copy:" + rel);
      if (failOn.includes(rel)) throw new Error("boom");
    },
  };
  return { t, calls };
}

describe("runTransfer", () => {
  const plan: TransferPlan = {
    ops: [
      { type: "mkdir", relPath: "world" },
      { type: "copy", relPath: "world/level.dat" },
      { type: "copy", relPath: "server.properties" },
    ],
  };
  const sizes = new Map([["world/level.dat", 100], ["server.properties", 20]]);

  it("executes every op and tallies transferred files and bytes", async () => {
    const { t, calls } = fakeTransferer();
    const progress: Array<[number, number]> = [];
    const summary = await runTransfer(plan, t, sizes, (d, tot) => progress.push([d, tot]));
    expect(calls).toEqual(["mkdir:world", "copy:world/level.dat", "copy:server.properties"]);
    expect(summary.filesTransferred).toBe(2);
    expect(summary.bytesTransferred).toBe(120);
    expect(summary.failures).toEqual([]);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
  });

  it("collects per-file failures without throwing", async () => {
    const { t } = fakeTransferer(["server.properties"]);
    const summary = await runTransfer(plan, t, sizes, () => {});
    expect(summary.filesTransferred).toBe(1);
    expect(summary.bytesTransferred).toBe(100);
    expect(summary.failures).toEqual([{ relPath: "server.properties", error: "boom" }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- syncEngine`
Expected: FAIL — `runTransfer` is not exported.

- [ ] **Step 3: Implement `runTransfer`**

Append to `src/lib/hosting/syncEngine.ts`:

```ts
import { Transferer, TransferSummary } from "./types";

export async function runTransfer(
  plan: TransferPlan,
  transferer: Transferer,
  sizes: Map<string, number>,
  onProgress: (done: number, total: number, label: string) => void
): Promise<TransferSummary> {
  const total = plan.ops.length;
  const summary: TransferSummary = { filesTransferred: 0, bytesTransferred: 0, failures: [] };

  for (let i = 0; i < plan.ops.length; i++) {
    const op = plan.ops[i];
    try {
      if (op.type === "mkdir") {
        await transferer.mkdir(op.relPath);
      } else {
        await transferer.copy(op.relPath);
        summary.filesTransferred += 1;
        summary.bytesTransferred += sizes.get(op.relPath) ?? 0;
      }
    } catch (err: any) {
      summary.failures.push({ relPath: op.relPath, error: err?.message || String(err) });
    }
    onProgress(i + 1, total, op.type === "copy" ? op.relPath : `Creating ${op.relPath}`);
  }

  return summary;
}
```

Note: keep the existing `import { FileEntry, TransferOp, TransferPlan } from "./types";` line at the top; you may merge these type imports into one statement if you prefer.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- syncEngine`
Expected: PASS (planner + executor tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hosting/syncEngine.ts src/lib/hosting/__tests__/syncEngine.test.ts
git commit -m "feat(hosting): add transfer executor with failure collection"
```

---

### Task 5: Akliz provider, SFTP adapter, filesystem walkers, and registry

**Files:**
- Create: `src/lib/hosting/sftpClient.ts`
- Create: `src/lib/hosting/aklizProvider.ts`
- Create: `src/lib/hosting/registry.ts`
- Create: `src/lib/hosting/fsWalk.ts`
- Test: `src/lib/hosting/__tests__/aklizProvider.test.ts`
- Modify: `package.json` (add `ssh2-sftp-client` + types)

**Interfaces:**
- Consumes: `SftpClient`, `HostingProvider`, `HostCredentials`, `FileEntry` from `types.ts`.
- Produces:
  - `aklizProvider: HostingProvider` (id `"AKLIZ"`, displayName `"Akliz"`).
  - `getProvider(id: string): HostingProvider` from `registry.ts` (throws on unknown id).
  - `makeSftpClient(creds: HostCredentials): SftpClient` from `sftpClient.ts`.
  - `walkLocal(root: string): Promise<FileEntry[]>` and `walkRemote(client: SftpClient, base: string): Promise<FileEntry[]>` from `fsWalk.ts`. Used by Task 6.

- [ ] **Step 1: Install the SFTP dependency**

Run: `npm install ssh2-sftp-client@^11 && npm install -D @types/ssh2-sftp-client`
Expected: both packages added to `package.json`; no errors.

- [ ] **Step 2: Write the failing provider test**

Create `src/lib/hosting/__tests__/aklizProvider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aklizProvider } from "../aklizProvider";
import { getProvider } from "../registry";
import { HostCredentials } from "../types";

const valid: HostCredentials = {
  host: "bos-sr-1-1-1.akliz.net",
  port: 22,
  username: "user@email.com.123",
  password: "pw",
  remoteBasePath: ".",
};

describe("aklizProvider.validateCredentials", () => {
  it("accepts well-formed credentials", () => {
    expect(aklizProvider.validateCredentials(valid)).toBeNull();
  });
  it("rejects an empty host", () => {
    expect(aklizProvider.validateCredentials({ ...valid, host: "" })).toMatch(/host/i);
  });
  it("rejects an out-of-range port", () => {
    expect(aklizProvider.validateCredentials({ ...valid, port: 0 })).toMatch(/port/i);
    expect(aklizProvider.validateCredentials({ ...valid, port: 70000 })).toMatch(/port/i);
  });
  it("rejects an empty username or password", () => {
    expect(aklizProvider.validateCredentials({ ...valid, username: "" })).toMatch(/username/i);
    expect(aklizProvider.validateCredentials({ ...valid, password: "" })).toMatch(/password/i);
  });
  it("rejects an empty remote base path", () => {
    expect(aklizProvider.validateCredentials({ ...valid, remoteBasePath: "" })).toMatch(/path/i);
  });
});

describe("registry", () => {
  it("resolves the AKLIZ provider", () => {
    expect(getProvider("AKLIZ").id).toBe("AKLIZ");
  });
  it("throws on an unknown provider", () => {
    expect(() => getProvider("NOPE")).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- aklizProvider`
Expected: FAIL — cannot resolve `../aklizProvider`.

- [ ] **Step 4: Implement the SFTP adapter**

Create `src/lib/hosting/sftpClient.ts`:

```ts
import SftpClientLib from "ssh2-sftp-client";
import path from "path";
import { FileEntry, HostCredentials, SftpClient } from "./types";

// Thin adapter from ssh2-sftp-client to our injectable SftpClient interface.
// Left to manual verification against a live Akliz instance.
export function makeSftpClient(creds: HostCredentials): SftpClient {
  const sftp = new SftpClientLib();
  return {
    async connect() {
      await sftp.connect({
        host: creds.host,
        port: creds.port,
        username: creds.username,
        password: creds.password,
        readyTimeout: 20000,
      });
    },
    async list(remoteDir: string): Promise<FileEntry[]> {
      const items = await sftp.list(remoteDir);
      return items.map((it: any) => ({
        relPath: it.name, // basename; walkRemote composes full relPaths
        size: it.size,
        mtimeMs: it.modifyTime,
        isDir: it.type === "d",
      }));
    },
    async mkdir(remoteDir: string) {
      await sftp.mkdir(remoteDir, true);
    },
    async put(localPath: string, remotePath: string) {
      await sftp.mkdir(path.posix.dirname(remotePath), true).catch(() => {});
      await sftp.put(localPath, remotePath);
    },
    async get(remotePath: string, localPath: string) {
      await sftp.get(remotePath, localPath);
    },
    async end() {
      await sftp.end();
    },
  };
}
```

- [ ] **Step 5: Implement the Akliz provider**

Create `src/lib/hosting/aklizProvider.ts`:

```ts
import { HostCredentials, HostingProvider, SftpClient } from "./types";
import { makeSftpClient } from "./sftpClient";

export const aklizProvider: HostingProvider = {
  id: "AKLIZ",
  displayName: "Akliz",
  validateCredentials(c: HostCredentials): string | null {
    if (!c.host || !c.host.trim()) return "SFTP host is required";
    if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) return "Port must be between 1 and 65535";
    if (!c.username || !c.username.trim()) return "Username is required";
    if (!c.password || !c.password.trim()) return "Password is required";
    if (!c.remoteBasePath || !c.remoteBasePath.trim()) return "Remote base path is required";
    return null;
  },
  createClient(c: HostCredentials): SftpClient {
    return makeSftpClient(c);
  },
};
```

- [ ] **Step 6: Implement the registry**

Create `src/lib/hosting/registry.ts`:

```ts
import { HostingProvider } from "./types";
import { aklizProvider } from "./aklizProvider";

const PROVIDERS: Record<string, HostingProvider> = {
  [aklizProvider.id]: aklizProvider,
};

export function getProvider(id: string): HostingProvider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown hosting provider: ${id}`);
  return p;
}

export function listProviders(): HostingProvider[] {
  return Object.values(PROVIDERS);
}
```

- [ ] **Step 7: Implement the filesystem walkers**

Create `src/lib/hosting/fsWalk.ts`:

```ts
import fs from "fs";
import path from "path";
import { FileEntry, SftpClient } from "./types";

// Recursively list a local tree as POSIX relPaths relative to `root`.
export async function walkLocal(root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  if (!fs.existsSync(root)) return out;

  const walk = (absDir: string, relDir: string) => {
    for (const name of fs.readdirSync(absDir)) {
      const abs = path.join(absDir, name);
      const rel = relDir ? `${relDir}/${name}` : name;
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        out.push({ relPath: rel, size: 0, mtimeMs: st.mtimeMs, isDir: true });
        walk(abs, rel);
      } else {
        out.push({ relPath: rel, size: st.size, mtimeMs: st.mtimeMs, isDir: false });
      }
    }
  };
  walk(root, "");
  return out;
}

// Recursively list a remote tree under `base` as POSIX relPaths.
// `client.list` returns shallow entries whose `relPath` is the basename.
export async function walkRemote(client: SftpClient, base: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];

  const walk = async (remoteDir: string, relDir: string) => {
    const items = await client.list(remoteDir);
    for (const it of items) {
      const name = it.relPath;
      if (name === "." || name === "..") continue;
      const rel = relDir ? `${relDir}/${name}` : name;
      if (it.isDir) {
        out.push({ relPath: rel, size: 0, mtimeMs: it.mtimeMs, isDir: true });
        await walk(`${remoteDir}/${name}`, rel);
      } else {
        out.push({ relPath: rel, size: it.size, mtimeMs: it.mtimeMs, isDir: false });
      }
    }
  };
  await walk(base, "");
  return out;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- aklizProvider`
Expected: PASS (validation + registry tests).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/lib/hosting/sftpClient.ts src/lib/hosting/aklizProvider.ts src/lib/hosting/registry.ts src/lib/hosting/fsWalk.ts src/lib/hosting/__tests__/aklizProvider.test.ts
git commit -m "feat(hosting): add Akliz SFTP provider, walkers, and registry"
```

---

### Task 6: Transfer orchestration service (`executeTransfer`) with dependency injection

**Files:**
- Create: `src/lib/hosting/transferService.ts`
- Test: `src/lib/hosting/__tests__/transferService.test.ts`

**Interfaces:**
- Consumes: `planTransfer`, `runTransfer` (syncEngine); `FileEntry`, `SftpClient`, `Transferer`, `TransferDirection`, `TransferSummary`, `HostCredentials` (types).
- Produces:
  - `interface TransferContext` (the injected collaborators — see code).
  - `executeTransfer(direction: TransferDirection, ctx: TransferContext): Promise<TransferSummary>` — pure orchestration: chooses source/dest by direction, builds the ignore list (adds `"server.properties"` when `ctx.excludeConfig`), plans, runs, and returns the summary. All I/O is injected so this is unit-tested with fakes. Used by Task 7.

- [ ] **Step 1: Write the failing orchestration test**

Create `src/lib/hosting/__tests__/transferService.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { executeTransfer, TransferContext } from "../transferService";
import { FileEntry, Transferer } from "../types";

const f = (relPath: string, size: number, mtimeMs: number): FileEntry => ({ relPath, size, mtimeMs, isDir: false });

function baseCtx(over: Partial<TransferContext> = {}): TransferContext {
  const copied: string[] = [];
  const transferer: Transferer = {
    async mkdir() {},
    async copy(rel) { copied.push(rel); },
  };
  return {
    excludeConfig: false,
    localEntries: [f("world/level.dat", 10, 100), f("server.properties", 5, 100)],
    remoteEntries: [],
    sizesFor: (entries) => new Map(entries.map((e) => [e.relPath, e.size])),
    makeTransferer: () => transferer,
    onProgress: () => {},
    _copied: copied,
    ...over,
  } as any;
}

describe("executeTransfer", () => {
  it("PUSH plans local->remote and copies missing files", async () => {
    const ctx = baseCtx();
    const summary = await executeTransfer("PUSH", ctx);
    expect((ctx as any)._copied.sort()).toEqual(["server.properties", "world/level.dat"]);
    expect(summary.filesTransferred).toBe(2);
  });

  it("excludeConfig skips server.properties", async () => {
    const ctx = baseCtx({ excludeConfig: true });
    await executeTransfer("PUSH", ctx);
    expect((ctx as any)._copied).not.toContain("server.properties");
  });

  it("PULL plans remote->local", async () => {
    const ctx = baseCtx({
      localEntries: [],
      remoteEntries: [f("world/level.dat", 10, 100)],
    });
    const summary = await executeTransfer("PULL", ctx);
    expect((ctx as any)._copied).toEqual(["world/level.dat"]);
    expect(summary.filesTransferred).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- transferService`
Expected: FAIL — cannot resolve `../transferService`.

- [ ] **Step 3: Implement the orchestration service**

Create `src/lib/hosting/transferService.ts`:

```ts
import { planTransfer, runTransfer } from "./syncEngine";
import { DEFAULT_IGNORE, FileEntry, TransferDirection, Transferer, TransferSummary } from "./types";

export interface TransferContext {
  excludeConfig: boolean;
  localEntries: FileEntry[];
  remoteEntries: FileEntry[];
  sizesFor: (entries: FileEntry[]) => Map<string, number>;
  makeTransferer: (direction: TransferDirection) => Transferer;
  onProgress: (done: number, total: number, label: string) => void;
}

export async function executeTransfer(direction: TransferDirection, ctx: TransferContext): Promise<TransferSummary> {
  const ignore = ctx.excludeConfig ? [...DEFAULT_IGNORE, "server.properties"] : DEFAULT_IGNORE;

  const source = direction === "PUSH" ? ctx.localEntries : ctx.remoteEntries;
  const dest = direction === "PUSH" ? ctx.remoteEntries : ctx.localEntries;

  const plan = planTransfer(source, dest, ignore);
  const sizes = ctx.sizesFor(source);
  const transferer = ctx.makeTransferer(direction);

  return runTransfer(plan, transferer, sizes, ctx.onProgress);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- transferService`
Expected: PASS (PUSH, excludeConfig, PULL).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hosting/transferService.ts src/lib/hosting/__tests__/transferService.test.ts
git commit -m "feat(hosting): add dependency-injected transfer orchestration"
```

---

### Task 7: API routes — host-link CRUD, connection test, and transfer

**Files:**
- Create: `src/app/api/servers/[id]/host-link/route.ts` (GET, PUT, DELETE)
- Create: `src/app/api/servers/[id]/host-link/test/route.ts` (POST)
- Create: `src/app/api/servers/[id]/transfer/route.ts` (POST)

**Interfaces:**
- Consumes: `getAuthenticatedUser` (`@/lib/auth`), `verifyServerAccess` (`@/lib/serverAuth`), `prisma` (`@/lib/db`), `encryptSecret`/`decryptSecret` (`@/lib/hosting/secretStore`), `getProvider` (`@/lib/hosting/registry`), `walkLocal`/`walkRemote` (`@/lib/hosting/fsWalk`), `executeTransfer` (`@/lib/hosting/transferService`), `setProgress`/`clearProgress` (`@/lib/downloadProgress`), `getRunner` (`@/lib/runners/factory`), `dataRoot` (`@/lib/appPaths`).
- Produces: REST endpoints consumed by Task 8's modal.
  - `GET host-link` → `{ link: { provider, host, port, username, remoteBasePath, excludeConfig, lastPushAt, lastPullAt, lastError } | null }` (never the secret).
  - `PUT host-link` body `{ provider?, host, port, username, password?, remoteBasePath?, excludeConfig? }` → `{ link }`. Password re-encrypted only when a non-empty `password` is provided.
  - `DELETE host-link` → `{ ok: true }`.
  - `POST host-link/test` → `{ ok: true } | { ok: false, error }`.
  - `POST transfer` body `{ direction: "PUSH"|"PULL", confirmRemoteStopped: boolean }` → `{ summary } | { error }`.

- [ ] **Step 1: Implement the host-link CRUD route**

Create `src/app/api/servers/[id]/host-link/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { encryptSecret } from "@/lib/hosting/secretStore";
import { getProvider } from "@/lib/hosting/registry";

function publicLink(link: any) {
  if (!link) return null;
  const { secret, id, serverId, createdAt, updatedAt, ...rest } = link;
  return rest;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  const link = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });
  return NextResponse.json({ link: publicLink(link) });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  const body = await req.json();
  const provider = body.provider || "AKLIZ";
  const port = parseInt(body.port, 10);

  const existing = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });

  // Validate using the chosen provider. Use the new password if supplied,
  // otherwise a placeholder so validation passes when only editing other fields.
  const creds = {
    host: body.host ?? "",
    port: Number.isNaN(port) ? 22 : port,
    username: body.username ?? "",
    password: body.password || (existing ? "unchanged" : ""),
    remoteBasePath: body.remoteBasePath || ".",
  };
  const err = getProvider(provider).validateCredentials(creds);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const data: any = {
    provider,
    host: creds.host,
    port: creds.port,
    username: creds.username,
    remoteBasePath: creds.remoteBasePath,
    excludeConfig: Boolean(body.excludeConfig),
  };
  if (body.password) data.secret = encryptSecret(body.password);

  let link;
  if (existing) {
    link = await prisma.serverHostLink.update({ where: { serverId: params.id }, data });
  } else {
    if (!body.password) return NextResponse.json({ error: "Password is required" }, { status: 400 });
    link = await prisma.serverHostLink.create({ data: { ...data, serverId: params.id } });
  }

  const { secret, id, serverId, createdAt, updatedAt, ...rest } = link;
  return NextResponse.json({ link: rest });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  await prisma.serverHostLink.deleteMany({ where: { serverId: params.id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Manually verify host-link CRUD against the dev server**

Run the dev app (`npm run electron:dev`), sign in, create a server, then in DevTools console:

```js
await fetch(`/api/servers/SERVER_ID/host-link`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: "h.akliz.net", port: 22, username: "u@e.com.1", password: "pw", remoteBasePath: "." }) }).then(r => r.json());
await fetch(`/api/servers/SERVER_ID/host-link`).then(r => r.json());
```
Expected: PUT returns `{ link: { host: "h.akliz.net", ... } }` with NO `secret`; GET returns the same shape. Replace `SERVER_ID` with a real id.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/servers/[id]/host-link/route.ts
git commit -m "feat(hosting): add host-link CRUD API route"
```

- [ ] **Step 4: Implement the connection test route**

Create `src/app/api/servers/[id]/host-link/test/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { decryptSecret } from "@/lib/hosting/secretStore";
import { getProvider } from "@/lib/hosting/registry";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  const link = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });
  if (!link) return NextResponse.json({ ok: false, error: "No host link configured" }, { status: 400 });

  const provider = getProvider(link.provider);
  const client = provider.createClient({
    host: link.host,
    port: link.port,
    username: link.username,
    password: decryptSecret(link.secret),
    remoteBasePath: link.remoteBasePath,
  });

  try {
    await client.connect();
    await client.list(link.remoteBasePath);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Connection failed" });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/servers/[id]/host-link/test/route.ts
git commit -m "feat(hosting): add SFTP connection test API route"
```

- [ ] **Step 6: Implement the transfer route**

Create `src/app/api/servers/[id]/transfer/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { decryptSecret } from "@/lib/hosting/secretStore";
import { getProvider } from "@/lib/hosting/registry";
import { walkLocal, walkRemote } from "@/lib/hosting/fsWalk";
import { executeTransfer } from "@/lib/hosting/transferService";
import { setProgress, clearProgress } from "@/lib/downloadProgress";
import { getRunner } from "@/lib/runners/factory";
import { dataRoot } from "@/lib/appPaths";
import { FileEntry, SftpClient, TransferDirection, Transferer } from "@/lib/hosting/types";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  const { server } = access;

  const { direction, confirmRemoteStopped } = await req.json();
  if (direction !== "PUSH" && direction !== "PULL") {
    return NextResponse.json({ error: "direction must be PUSH or PULL" }, { status: 400 });
  }
  if (!confirmRemoteStopped) {
    return NextResponse.json({ error: "You must confirm the remote server is stopped" }, { status: 400 });
  }

  const link = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });
  if (!link) return NextResponse.json({ error: "No host link configured" }, { status: 400 });

  // Stop the local server first (mirrors the export route's behavior).
  const runner = getRunner(server.runnerType);
  if (server.status === "RUNNING" || server.status === "STARTING") {
    await runner.stop(server);
    await prisma.server.update({ where: { id: server.id }, data: { status: "STOPPED" } });
  }

  const localRoot = server.localPath || path.join(dataRoot(), "local-servers", server.id);
  const remoteBase = link.remoteBasePath;

  const provider = getProvider(link.provider);
  const client: SftpClient = provider.createClient({
    host: link.host,
    port: link.port,
    username: link.username,
    password: decryptSecret(link.secret),
    remoteBasePath: remoteBase,
  });

  const phase = direction === "PUSH" ? "Uploading" : "Downloading";
  try {
    setProgress(params.id, { phase: "transfer", percent: null, label: `Connecting to ${provider.displayName}...` });
    await client.connect();

    const localEntries = await walkLocal(localRoot);
    const remoteEntries = await walkRemote(client, remoteBase);

    // Build a Transferer that copies in the requested direction, ensuring the
    // parent directory exists on the destination first.
    const makeTransferer = (dir: TransferDirection): Transferer => ({
      async mkdir(rel: string) {
        if (dir === "PUSH") await client.mkdir(path.posix.join(remoteBase, rel));
        else require("fs").mkdirSync(path.join(localRoot, rel), { recursive: true });
      },
      async copy(rel: string) {
        const localPath = path.join(localRoot, rel);
        const remotePath = path.posix.join(remoteBase, rel.split(path.sep).join("/"));
        if (dir === "PUSH") {
          await client.put(localPath, remotePath);
        } else {
          require("fs").mkdirSync(path.dirname(localPath), { recursive: true });
          await client.get(remotePath, localPath);
        }
      },
    });

    const summary = await executeTransfer(direction, {
      excludeConfig: link.excludeConfig,
      localEntries,
      remoteEntries,
      sizesFor: (entries: FileEntry[]) => new Map(entries.map((e) => [e.relPath, e.size])),
      makeTransferer,
      onProgress: (done, total, label) =>
        setProgress(params.id, {
          phase: "transfer",
          percent: total > 0 ? Math.round((done / total) * 100) : null,
          label: `${phase} ${label}`,
        }),
    });

    await prisma.serverHostLink.update({
      where: { serverId: params.id },
      data: {
        lastError: summary.failures.length ? `${summary.failures.length} file(s) failed` : null,
        ...(direction === "PUSH" ? { lastPushAt: new Date() } : { lastPullAt: new Date() }),
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER",
        details: `${direction === "PUSH" ? "Pushed" : "Pulled"} server '${server.name}' ${direction === "PUSH" ? "to" : "from"} ${provider.displayName} (${summary.filesTransferred} files, ${(summary.bytesTransferred / 1048576).toFixed(1)} MB).`,
      },
    });

    return NextResponse.json({ summary });
  } catch (e: any) {
    await prisma.serverHostLink.update({ where: { serverId: params.id }, data: { lastError: e?.message || "Transfer failed" } }).catch(() => {});
    return NextResponse.json({ error: e?.message || "Transfer failed" }, { status: 500 });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
    clearProgress(params.id);
  }
}
```

- [ ] **Step 7: Run the full test suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — all suites green, including the new `secretStore`, `syncEngine`, `aklizProvider`, and `transferService` suites.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/servers/[id]/transfer/route.ts
git commit -m "feat(hosting): add push/pull transfer API route"
```

---

### Task 8: UI — Transfer/Host modal and dashboard button

**Files:**
- Create: `src/components/HostTransferModal.tsx`
- Modify: `src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: the Task 7 endpoints (`/api/servers/[id]/host-link`, `/host-link/test`, `/transfer`) and `/api/servers/[id]/progress` for live progress polling.
- Produces: a `<HostTransferModal serverId serverName onClose />` component and a button on each server card that opens it.

- [ ] **Step 1: Build the modal component**

Create `src/components/HostTransferModal.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { X, UploadCloud, DownloadCloud, Plug, Loader2 } from "lucide-react";

interface Props {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

interface LinkState {
  provider: string;
  host: string;
  port: number;
  username: string;
  remoteBasePath: string;
  excludeConfig: boolean;
  lastPushAt?: string | null;
  lastPullAt?: string | null;
  lastError?: string | null;
}

export default function HostTransferModal({ serverId, serverName, onClose }: Props) {
  const [form, setForm] = useState({ host: "", port: 22, username: "", password: "", remoteBasePath: ".", excludeConfig: false });
  const [saved, setSaved] = useState<LinkState | null>(null);
  const [confirmStopped, setConfirmStopped] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ percent: number | null; label: string } | null>(null);

  const loadLink = async () => {
    const res = await fetch(`/api/servers/${serverId}/host-link`);
    const body = await res.json();
    if (body.link) {
      setSaved(body.link);
      setForm((f) => ({ ...f, host: body.link.host, port: body.link.port, username: body.link.username, remoteBasePath: body.link.remoteBasePath, excludeConfig: body.link.excludeConfig, password: "" }));
    }
  };

  useEffect(() => { loadLink(); }, [serverId]);

  const saveLink = async () => {
    setBusy("save"); setMessage(null);
    const res = await fetch(`/api/servers/${serverId}/host-link`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) { setMessage(body.error || "Save failed"); return; }
    setMessage("Connection saved.");
    await loadLink();
  };

  const testConn = async () => {
    setBusy("test"); setMessage(null);
    const res = await fetch(`/api/servers/${serverId}/host-link/test`, { method: "POST" });
    const body = await res.json();
    setBusy(null);
    setMessage(body.ok ? "Connection succeeded." : `Connection failed: ${body.error}`);
  };

  const pollProgress = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/progress`);
      if (res.ok) { const b = await res.json(); setProgress(b.progress ? { percent: b.progress.percent, label: b.progress.label } : null); }
    } catch { /* ignore */ }
  };

  const transfer = async (direction: "PUSH" | "PULL") => {
    setBusy(direction); setMessage(null); setProgress(null);
    const interval = setInterval(pollProgress, 1000);
    try {
      const res = await fetch(`/api/servers/${serverId}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction, confirmRemoteStopped: confirmStopped }) });
      const body = await res.json();
      if (!res.ok) setMessage(body.error || "Transfer failed");
      else setMessage(`${direction === "PUSH" ? "Pushed" : "Pulled"} ${body.summary.filesTransferred} file(s), ${(body.summary.bytesTransferred / 1048576).toFixed(1)} MB.${body.summary.failures.length ? ` ${body.summary.failures.length} failed.` : ""}`);
    } finally {
      clearInterval(interval); setBusy(null); setProgress(null); await loadLink();
    }
  };

  const canTransfer = saved && confirmStopped && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Transfer "{serverName}" to a host</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-slate-400 mb-4">Full-server mirror over SFTP. In Akliz Command Center, open your server &rarr; Manage &rarr; "Show SFTP Information" for the host and username. The password is your Command Center login.</p>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-300">SFTP Host
            <input className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="bos-sr-1-1-1.akliz.net" />
          </label>
          <div className="flex gap-3">
            <label className="block text-xs font-medium text-slate-300 w-24">Port
              <input type="number" className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 22 })} />
            </label>
            <label className="block text-xs font-medium text-slate-300 flex-1">Username
              <input className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="you@email.com.123" />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-300">Password {saved && <span className="text-slate-500">(leave blank to keep current)</span>}
            <input type="password" className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Command Center password" />
          </label>
          <label className="block text-xs font-medium text-slate-300">Remote base path
            <input className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.remoteBasePath} onChange={(e) => setForm({ ...form, remoteBasePath: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={form.excludeConfig} onChange={(e) => setForm({ ...form, excludeConfig: e.target.checked })} />
            Don't overwrite host config (skip server.properties)
          </label>

          <div className="flex gap-2">
            <button onClick={saveLink} disabled={!!busy} className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white">{busy === "save" ? "Saving..." : "Save connection"}</button>
            <button onClick={testConn} disabled={!saved || !!busy} className="rounded-lg border border-slate-600 hover:bg-slate-800 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-slate-200 flex items-center gap-1.5"><Plug className="w-4 h-4" /> Test</button>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-700 pt-4">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300 mb-3">A full mirror overwrites files on the destination. The local server is stopped automatically; stop the Akliz server in Command Center before transferring.</div>
          <label className="flex items-center gap-2 text-xs text-slate-300 mb-3">
            <input type="checkbox" checked={confirmStopped} onChange={(e) => setConfirmStopped(e.target.checked)} />
            I've stopped the server in Akliz Command Center.
          </label>
          <div className="flex gap-2">
            <button onClick={() => transfer("PUSH")} disabled={!canTransfer} className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white flex items-center justify-center gap-1.5">{busy === "PUSH" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />} Push to Akliz</button>
            <button onClick={() => transfer("PULL")} disabled={!canTransfer} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white flex items-center justify-center gap-1.5">{busy === "PULL" ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />} Pull from Akliz</button>
          </div>

          {progress && (
            <div className="mt-3">
              <div className="text-xs text-slate-400 mb-1">{progress.label}</div>
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all" style={{ width: progress.percent !== null ? `${progress.percent}%` : "40%" }} />
              </div>
            </div>
          )}

          {saved && (
            <div className="mt-3 text-xs text-slate-500">
              {saved.lastPushAt && <div>Last push: {new Date(saved.lastPushAt).toLocaleString()}</div>}
              {saved.lastPullAt && <div>Last pull: {new Date(saved.lastPullAt).toLocaleString()}</div>}
              {saved.lastError && <div className="text-red-400">Last error: {saved.lastError}</div>}
            </div>
          )}
        </div>

        {message && <div className="mt-4 text-sm text-slate-200 bg-slate-800 rounded-lg px-3 py-2">{message}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the button and modal into the dashboard**

In `src/components/DashboardView.tsx`:

1. Add to the lucide-react import block (near `Download`): `UploadCloud,`
2. Add the default import near the top with the other component imports: `import HostTransferModal from "@/components/HostTransferModal";`
3. Add modal state next to the other `useState` hooks (near `progressMap`): `const [hostModalServer, setHostModalServer] = useState<{ id: string; name: string } | null>(null);`
4. In the server-card action row, immediately before the existing export anchor (`<a href={`/api/servers/${server.id}/export`} ...>`), add:

```tsx
<button
  onClick={() => setHostModalServer({ id: server.id, name: server.name })}
  className={`px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition-all ${isServerLoading || server.status === "STARTING" ? "opacity-50 pointer-events-none" : ""}`}
  title="Transfer to hosting provider"
>
  <UploadCloud className="w-4 h-4" />
</button>
```

5. Just before the component's closing `</…>` of the top-level fragment (alongside any other modals rendered at the root), add:

```tsx
{hostModalServer && (
  <HostTransferModal
    serverId={hostModalServer.id}
    serverName={hostModalServer.name}
    onClose={() => setHostModalServer(null)}
  />
)}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Next.js build completes with no TypeScript errors.

- [ ] **Step 4: Manual end-to-end verification**

Run `npm run electron:dev`, open a server card, click the new cloud-upload button. Confirm: the modal opens; saving a connection persists (reopen shows the host/username, password blank); "Test" reports success/failure against your real Akliz instance; with the confirmation checkbox ticked, "Push to Akliz" uploads files and shows a progress bar; "Pull from Akliz" downloads them; last push/pull timestamps appear.

- [ ] **Step 5: Commit**

```bash
git add src/components/HostTransferModal.tsx src/components/DashboardView.tsx
git commit -m "feat(hosting): add transfer/host modal and dashboard entry point"
```

---

## Notes for the implementer

- **Remote paths are POSIX.** Always compose remote paths with `path.posix.join` and convert Windows separators (`rel.split(path.sep).join("/")`) before sending to SFTP.
- **`ssh2-sftp-client` modifyTime** is in milliseconds; the planner's `mtimeMs` comparison assumes ms on both sides (`fs.statSync().mtimeMs` is also ms). If a future provider returns seconds, normalize in its walker.
- **No deletes:** the planner never emits a delete op. Don't add one without a deliberate design follow-up — it's the dangerous part deferred from v1.
- **Server.properties:** pushed by default (overwrites Akliz's network binding). The `excludeConfig` toggle is the user-facing safety valve.
