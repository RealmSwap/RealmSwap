# Selective SFTP Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick exactly which files a Cloud SFTP transfer moves, defaulting to the game's world-save data, remembered per server, applied to both push and pull.

**Architecture:** A pure include-path filter in the sync engine, a per-game world-save default map, a new `includePaths` column on `ServerHostLink`, a direction-aware tree API (local walk for push, remote SFTP walk for pull), a tri-state checkbox tree component, and picker wiring in `CloudAdvisorModal`. The old `excludeConfig` toggle is removed and folded into the picker.

**Tech Stack:** Next.js 14 (app router), Prisma 5 + SQLite, ssh2-sftp-client, React, vitest.

## Global Constraints

- POSIX relPaths everywhere in the transfer layer — never `path.join` for relPaths (emits Windows `\`). Use `/`.
- `DEFAULT_IGNORE` is an always-applied hard floor, independent of the picker: junk (`logs/`, `cache/`, `**/session.lock`, `realm.json`, `.secret.key`) never syncs even under a checked parent.
- `includePaths` is a JSON-encoded string array on `ServerHostLink`; `null`/`[]` means full mirror (back-compat).
- Owner-only guards on every server route, matching the existing transfer route.
- Git: work on branch `feat/selective-sftp-transfer` (already created, has the spec commit and the password-fix parent). Commit with `git -c user.email="jimmymills@users.noreply.github.com"`. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Palworld world-save path: `palworld-server/Pal/Saved/SaveGames`.

---

## File Structure

- `src/lib/hosting/syncEngine.ts` — add `isIncluded()` + `include` param to `planTransfer()`.
- `src/lib/hosting/worldSaveDefaults.ts` — **new**, per-game world-save relPaths.
- `src/lib/hosting/transferService.ts` — swap `excludeConfig` for `include`.
- `src/lib/hosting/types.ts` — no change (include is a plain param).
- `prisma/schema.prisma` + `prisma/migrations/20260712000000_selective_transfer/migration.sql` — add `includePaths`, drop `excludeConfig`.
- `src/app/api/servers/[id]/host-link/route.ts` — persist `includePaths`, drop `excludeConfig`.
- `src/app/api/servers/[id]/transfer/tree/route.ts` — **new**, direction-aware tree.
- `src/app/api/servers/[id]/transfer/route.ts` — read `includePaths`, drop `excludeConfig`.
- `src/components/dashboard/advisor/FilePickerTree.tsx` — **new**, tri-state checkbox tree.
- `src/components/dashboard/advisor/CloudAdvisorModal.tsx` — picker wiring, remove `excludeConfig` UI.
- Tests: `src/lib/hosting/__tests__/syncEngine.test.ts`, `.../worldSaveDefaults.test.ts` (new), `.../transferService.test.ts`.

---

## Task 1: Sync engine include filter

**Files:**
- Modify: `src/lib/hosting/syncEngine.ts`
- Test: `src/lib/hosting/__tests__/syncEngine.test.ts`

**Interfaces:**
- Consumes: `FileEntry`, `TransferPlan` from `../types`.
- Produces:
  - `isIncluded(relPath: string, include: string[]): boolean`
  - `planTransfer(source: FileEntry[], dest: FileEntry[], ignore: string[], include?: string[]): TransferPlan` — `include` defaults to `[]` (= everything).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/hosting/__tests__/syncEngine.test.ts` (after the existing `planTransfer` describe block, before `fakeTransferer`):

```typescript
import { planTransfer, isIgnored, isIncluded, runTransfer } from "../syncEngine";

describe("isIncluded", () => {
  it("includes everything when the include list is empty", () => {
    expect(isIncluded("anything/at/all.txt", [])).toBe(true);
  });
  it("includes an exact path match", () => {
    expect(isIncluded("world", ["world"])).toBe(true);
  });
  it("includes paths under an included folder", () => {
    expect(isIncluded("world/region/r.0.0.mca", ["world"])).toBe(true);
  });
  it("excludes paths outside the included set", () => {
    expect(isIncluded("libraries/foo.jar", ["world"])).toBe(false);
  });
  it("does not treat a prefix string as a folder match", () => {
    // "world2" must NOT match include "world"
    expect(isIncluded("world2/level.dat", ["world"])).toBe(false);
  });
});

describe("planTransfer with include filter", () => {
  it("copies only included files", () => {
    const plan = planTransfer(
      [f("world/level.dat", 5, 1), f("libraries/foo.jar", 5, 1)],
      [],
      [],
      ["world"]
    );
    const paths = plan.ops.map((o) => o.relPath);
    expect(paths).toContain("world/level.dat");
    expect(paths).not.toContain("libraries/foo.jar");
  });

  it("still applies DEFAULT_IGNORE under an included folder", () => {
    const plan = planTransfer(
      [f("world/session.lock", 5, 1), f("world/level.dat", 5, 1)],
      [],
      DEFAULT_IGNORE,
      ["world"]
    );
    const paths = plan.ops.map((o) => o.relPath);
    expect(paths).not.toContain("world/session.lock");
    expect(paths).toContain("world/level.dat");
  });

  it("empty include list transfers everything (back-compat)", () => {
    const plan = planTransfer([f("a.txt", 1, 1), f("b.txt", 1, 1)], [], [], []);
    expect(plan.ops.map((o) => o.relPath).sort()).toEqual(["a.txt", "b.txt"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hosting/__tests__/syncEngine.test.ts`
Expected: FAIL — `isIncluded is not a function` / `planTransfer` ignores the 4th arg.

- [ ] **Step 3: Implement the include filter**

In `src/lib/hosting/syncEngine.ts`, add `isIncluded` after `isIgnored`:

```typescript
// Include allowlist (inverse of ignore):
//   [] (empty)  -> include everything
//   "path"      -> include that exact relPath and anything beneath it
export function isIncluded(relPath: string, include: string[]): boolean {
  if (include.length === 0) return true;
  for (const inc of include) {
    if (relPath === inc || relPath.startsWith(inc + "/")) return true;
  }
  return false;
}
```

Change the `planTransfer` signature and add the include guard at the top of the loop:

```typescript
export function planTransfer(source: FileEntry[], dest: FileEntry[], ignore: string[], include: string[] = []): TransferPlan {
  const destByPath = new Map(dest.map((e) => [e.relPath, e]));
  const mkdirs: TransferOp[] = [];
  const copies: TransferOp[] = [];

  for (const entry of source) {
    if (isIgnored(entry.relPath, ignore)) continue;
    if (!isIncluded(entry.relPath, include)) continue;

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

  mkdirs.sort((a, b) => a.relPath.split("/").length - b.relPath.split("/").length || a.relPath.localeCompare(b.relPath));
  copies.sort((a, b) => a.relPath.localeCompare(b.relPath));

  return { ops: [...mkdirs, ...copies] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hosting/__tests__/syncEngine.test.ts`
Expected: PASS (all, including the pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hosting/syncEngine.ts src/lib/hosting/__tests__/syncEngine.test.ts
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: add include-path filter to sync engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Per-game world-save defaults

**Files:**
- Create: `src/lib/hosting/worldSaveDefaults.ts`
- Test: `src/lib/hosting/__tests__/worldSaveDefaults.test.ts`

**Interfaces:**
- Produces: `worldSaveDefaults(game: string): string[]` — POSIX relPaths relative to the transfer base; `[]` when unknown or saves live outside the server dir.

- [ ] **Step 1: Write the failing test**

Create `src/lib/hosting/__tests__/worldSaveDefaults.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { worldSaveDefaults } from "../worldSaveDefaults";

describe("worldSaveDefaults", () => {
  it("maps Palworld to its SaveGames dir", () => {
    expect(worldSaveDefaults("PALWORLD")).toEqual(["palworld-server/Pal/Saved/SaveGames"]);
  });
  it("maps Minecraft to world/", () => {
    expect(worldSaveDefaults("MINECRAFT")).toEqual(["world"]);
  });
  it("maps Enshrouded, ARK, Zomboid", () => {
    expect(worldSaveDefaults("ENSHROUDED")).toEqual(["enshrouded-server/savegame"]);
    expect(worldSaveDefaults("ARK")).toEqual(["ark-server/ShooterGame/Saved/SavedArksLocal"]);
    expect(worldSaveDefaults("ZOMBOID")).toEqual(["zomboid-server/zomboid-data/Saves"]);
  });
  it("is case-insensitive", () => {
    expect(worldSaveDefaults("palworld")).toEqual(["palworld-server/Pal/Saved/SaveGames"]);
  });
  it("returns [] for Valheim (saves live outside the server dir)", () => {
    expect(worldSaveDefaults("VALHEIM")).toEqual([]);
  });
  it("returns [] for unknown games", () => {
    expect(worldSaveDefaults("SOMETHING_ELSE")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/hosting/__tests__/worldSaveDefaults.test.ts`
Expected: FAIL — cannot find module `../worldSaveDefaults`.

- [ ] **Step 3: Implement the module**

Create `src/lib/hosting/worldSaveDefaults.ts`:

```typescript
// World-save data locations per game, as POSIX paths relative to the server's
// transfer base (the local server dir / the host's remoteBasePath — they
// mirror each other). Used to pre-check the transfer file picker.
//
// Keep conceptually in sync with src/lib/backupPaths.ts (getSavePath), which
// holds the same knowledge as absolute, backup-shaped paths. An empty array
// means "no known in-tree save location" — the picker then leaves nothing
// pre-checked (games that save outside the server dir) or falls back to
// everything (unknown games); the caller decides.
const DEFAULTS: Record<string, string[]> = {
  PALWORLD: ["palworld-server/Pal/Saved/SaveGames"],
  MINECRAFT: ["world"],
  ENSHROUDED: ["enshrouded-server/savegame"],
  ARK: ["ark-server/ShooterGame/Saved/SavedArksLocal"],
  ZOMBOID: ["zomboid-server/zomboid-data/Saves"],
  // VALHEIM saves under the Windows user profile, not the server dir → no default.
};

export function worldSaveDefaults(game: string): string[] {
  return DEFAULTS[game.toUpperCase()] ?? [];
}

// Whether the game is recognized at all (drives the picker's "unknown => check
// everything" fallback, distinct from a known game that simply has no in-tree
// save location like Valheim).
export function isKnownGame(game: string): boolean {
  return game.toUpperCase() in DEFAULTS || game.toUpperCase() === "VALHEIM";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/hosting/__tests__/worldSaveDefaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hosting/worldSaveDefaults.ts src/lib/hosting/__tests__/worldSaveDefaults.test.ts
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: add per-game world-save default paths

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Thread include through executeTransfer; remove excludeConfig

**Files:**
- Modify: `src/lib/hosting/transferService.ts`
- Test: `src/lib/hosting/__tests__/transferService.test.ts`

**Interfaces:**
- Consumes: `planTransfer(..., include)` from Task 1, `DEFAULT_IGNORE` from `../types`.
- Produces: `TransferContext.include: string[]` (replaces `excludeConfig: boolean`); `executeTransfer(direction, ctx)` unchanged signature.

- [ ] **Step 1: Update the failing tests**

Replace the body of `src/lib/hosting/__tests__/transferService.test.ts` with:

```typescript
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
    include: [],
    localEntries: [f("world/level.dat", 10, 100), f("server.properties", 5, 100)],
    remoteEntries: [],
    sizesFor: (entries: FileEntry[]) => new Map(entries.map((e) => [e.relPath, e.size])),
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

  it("include filter limits the transfer to selected paths", async () => {
    const ctx = baseCtx({ include: ["world"] });
    await executeTransfer("PUSH", ctx);
    expect((ctx as any)._copied).toEqual(["world/level.dat"]);
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hosting/__tests__/transferService.test.ts`
Expected: FAIL — `include` not a property of `TransferContext` / still keyed on `excludeConfig`.

- [ ] **Step 3: Update transferService**

Replace `src/lib/hosting/transferService.ts` with:

```typescript
import { planTransfer, runTransfer } from "./syncEngine";
import { DEFAULT_IGNORE, FileEntry, TransferDirection, Transferer, TransferSummary } from "./types";

export interface TransferContext {
  include: string[]; // POSIX relPaths to transfer; [] = full mirror
  localEntries: FileEntry[];
  remoteEntries: FileEntry[];
  sizesFor: (entries: FileEntry[]) => Map<string, number>;
  makeTransferer: (direction: TransferDirection) => Transferer;
  onProgress: (done: number, total: number, label: string) => void;
}

export async function executeTransfer(direction: TransferDirection, ctx: TransferContext): Promise<TransferSummary> {
  const source = direction === "PUSH" ? ctx.localEntries : ctx.remoteEntries;
  const dest = direction === "PUSH" ? ctx.remoteEntries : ctx.localEntries;

  const plan = planTransfer(source, dest, DEFAULT_IGNORE, ctx.include);
  const sizes = ctx.sizesFor(source);
  const transferer = ctx.makeTransferer(direction);

  return runTransfer(plan, transferer, sizes, ctx.onProgress);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hosting/__tests__/transferService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hosting/transferService.ts src/lib/hosting/__tests__/transferService.test.ts
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: thread include filter through executeTransfer, drop excludeConfig

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Prisma schema — add includePaths, drop excludeConfig

**Files:**
- Modify: `prisma/schema.prisma:141` (the `excludeConfig` line)
- Create: `prisma/migrations/20260712000000_selective_transfer/migration.sql`

**Interfaces:**
- Produces: `ServerHostLink.includePaths: string | null` on the generated Prisma client; `excludeConfig` removed.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, inside `model ServerHostLink`, replace the line:

```prisma
  excludeConfig  Boolean   @default(false)
```

with:

```prisma
  includePaths   String? // JSON array of POSIX relPaths; null/[] = full mirror
```

- [ ] **Step 2: Create the migration SQL**

Create `prisma/migrations/20260712000000_selective_transfer/migration.sql`:

```sql
ALTER TABLE "ServerHostLink" ADD COLUMN "includePaths" TEXT;
ALTER TABLE "ServerHostLink" DROP COLUMN "excludeConfig";
```

- [ ] **Step 3: Apply to the dev DB and regenerate the client**

Run: `npm run db:push`
Expected: "Your database is now in sync with your Prisma schema." (Prisma reconciles the column add/drop on SQLite.)

Run: `npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Verify the client type**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "excludeConfig|includePaths" || echo "no stale references"`
Expected: references to `excludeConfig` in `host-link/route.ts`, `transfer/route.ts` (fixed in Tasks 5 & 7). Note them; they are expected until those tasks land. `includePaths` should be a known field.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260712000000_selective_transfer/migration.sql src/generated
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: add ServerHostLink.includePaths, drop excludeConfig

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Host-link route — persist includePaths, drop excludeConfig

**Files:**
- Modify: `src/app/api/servers/[id]/host-link/route.ts`

**Interfaces:**
- Consumes: request body `{ ..., includePaths?: string[] }`.
- Produces: persisted `link.includePaths` (JSON string); `publicLink` returns `includePaths` as a parsed array field `includePaths: string[]`.

- [ ] **Step 1: Update publicLink to expose parsed includePaths**

In `src/app/api/servers/[id]/host-link/route.ts`, replace `publicLink`:

```typescript
function publicLink(link: any) {
  if (!link) return null;
  const { secret, id, serverId, createdAt, updatedAt, includePaths, ...rest } = link;
  return { ...rest, includePaths: parseIncludePaths(includePaths) };
}

function parseIncludePaths(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Update PUT to persist includePaths and drop excludeConfig**

In the `PUT` handler, replace the `data` construction block:

```typescript
  const data: any = {
    provider,
    host: creds.host,
    port: creds.port,
    username: creds.username,
    remoteBasePath: creds.remoteBasePath,
  };
  if (body.password) data.secret = encryptSecret(body.password);
  if (Array.isArray(body.includePaths)) {
    data.includePaths = JSON.stringify(body.includePaths.filter((x: unknown) => typeof x === "string"));
  }
```

(Remove the `excludeConfig: Boolean(body.excludeConfig)` property entirely.)

- [ ] **Step 3: Update the PUT response to use publicLink**

Replace the tail of the `PUT` handler:

```typescript
  return NextResponse.json({ link: publicLink(link) });
```

(Replaces the manual `const { secret, id, ... } = link;` destructure so the response also carries parsed `includePaths`.)

- [ ] **Step 4: Verify no stale excludeConfig references remain here**

Run: `grep -n excludeConfig src/app/api/servers/[id]/host-link/route.ts || echo clean`
Expected: `clean`.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "host-link/route.ts" || echo "no type errors in host-link route"`
Expected: `no type errors in host-link route`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/servers/[id]/host-link/route.ts"
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: persist includePaths on host link, drop excludeConfig

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Transfer tree API route

**Files:**
- Create: `src/app/api/servers/[id]/transfer/tree/route.ts`

**Interfaces:**
- Consumes: `walkLocal`, `walkRemote` from `@/lib/hosting/fsWalk`; `getProvider` from `@/lib/hosting/registry`; `decryptSecret` from `@/lib/hosting/secretStore`; `worldSaveDefaults`, `isKnownGame` from `@/lib/hosting/worldSaveDefaults`; `dataRoot` from `@/lib/appPaths`.
- Produces: `GET` returning `{ tree: FileEntry[], includePaths: string[], defaultPaths: string[], unknownGame: boolean }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/servers/[id]/transfer/tree/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { decryptSecret } from "@/lib/hosting/secretStore";
import { getProvider } from "@/lib/hosting/registry";
import { walkLocal, walkRemote } from "@/lib/hosting/fsWalk";
import { worldSaveDefaults, isKnownGame } from "@/lib/hosting/worldSaveDefaults";
import { dataRoot } from "@/lib/appPaths";

function parseIncludePaths(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  if (!access.isOwner) return NextResponse.json({ error: "Only the server owner can manage host transfers" }, { status: 403 });
  const { server } = access;

  const direction = req.nextUrl.searchParams.get("direction") === "PULL" ? "PULL" : "PUSH";

  const link = await prisma.serverHostLink.findUnique({ where: { serverId: params.id } });
  if (!link) return NextResponse.json({ error: "No host link configured" }, { status: 400 });

  const includePaths = parseIncludePaths(link.includePaths);
  const defaultPaths = worldSaveDefaults(server.game);
  const unknownGame = !isKnownGame(server.game);

  try {
    let tree;
    if (direction === "PUSH") {
      const localRoot = server.localPath || path.join(dataRoot(), "local-servers", server.id);
      tree = await walkLocal(localRoot);
    } else {
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
        tree = await walkRemote(client, link.remoteBasePath);
      } finally {
        try { await client.end(); } catch { /* ignore */ }
      }
    }
    return NextResponse.json({ tree, includePaths, defaultPaths, unknownGame });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list files" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "transfer/tree/route.ts" || echo "no type errors in tree route"`
Expected: `no type errors in tree route`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/servers/[id]/transfer/tree/route.ts"
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: add direction-aware transfer tree API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Transfer route — read includePaths, drop excludeConfig

**Files:**
- Modify: `src/app/api/servers/[id]/transfer/route.ts:80-92` (the `executeTransfer` call) and the client-creation area.

**Interfaces:**
- Consumes: `link.includePaths`, `executeTransfer` with `TransferContext.include` (Task 3).

- [ ] **Step 1: Parse includePaths and pass include to executeTransfer**

In `src/app/api/servers/[id]/transfer/route.ts`, add a parse helper near the top (after imports):

```typescript
function parseIncludePaths(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
```

Then in the `executeTransfer` call, replace `excludeConfig: link.excludeConfig,` with `include: parseIncludePaths(link.includePaths),`:

```typescript
    const summary = await executeTransfer(direction, {
      include: parseIncludePaths(link.includePaths),
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
```

- [ ] **Step 2: Verify no stale excludeConfig references remain**

Run: `grep -rn excludeConfig src/app src/lib || echo clean`
Expected: `clean`.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "transfer/route.ts" || echo "no type errors in transfer route"`
Expected: `no type errors in transfer route`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/servers/[id]/transfer/route.ts"
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: apply includePaths filter to transfers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: FilePickerTree component

**Files:**
- Create: `src/components/dashboard/advisor/FilePickerTree.tsx`

**Interfaces:**
- Consumes: `FileEntry` from `@/lib/hosting/types`.
- Produces:
  - Component `FilePickerTree({ entries, checked, onChange }: { entries: FileEntry[]; checked: string[]; onChange: (next: string[]) => void })`.
  - Exported helpers (pure, so they can be reused/tested): `expandCover(cover: string[], allPaths: string[]): Set<string>` and `minimalCover(set: Set<string>): string[]`.

Selection model: `checked` (the persisted value) is a **minimal cover** — the top-most selected folder/file paths. Internally the component expands the cover to every covered path (`expandCover`), renders tri-state from that full set, and collapses back to a minimal cover (`minimalCover`) on every change.

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/advisor/FilePickerTree.tsx`:

```tsx
"use client";

import React, { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Folder, File as FileIcon } from "lucide-react";
import type { FileEntry } from "@/lib/hosting/types";

interface Node {
  name: string;
  path: string;
  isDir: boolean;
  children: Node[];
}

function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

// Build a nested tree from flat POSIX relPaths. Directory nodes are created
// implicitly from path segments so intermediate dirs always exist as nodes.
function buildTree(entries: FileEntry[]): Node[] {
  const roots: Node[] = [];
  const byPath = new Map<string, Node>();

  const ensure = (path: string, isDir: boolean): Node => {
    const existing = byPath.get(path);
    if (existing) {
      if (isDir) existing.isDir = true;
      return existing;
    }
    const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
    const node: Node = { name, path, isDir, children: [] };
    byPath.set(path, node);
    const parent = parentOf(path);
    if (parent === "") roots.push(node);
    else ensure(parent, true).children.push(node);
    return node;
  };

  for (const e of entries) ensure(e.relPath, e.isDir);

  const sortRec = (nodes: Node[]) => {
    nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// Expand a minimal cover into every path it selects (the cover path + all
// descendants present in the tree).
export function expandCover(cover: string[], allPaths: string[]): Set<string> {
  const set = new Set<string>();
  for (const c of cover) {
    set.add(c);
    for (const p of allPaths) {
      if (p.startsWith(c + "/")) set.add(p);
    }
  }
  return set;
}

// Collapse a full selected set back to the top-most selected paths.
export function minimalCover(set: Set<string>): string[] {
  const cover: string[] = [];
  for (const p of set) {
    if (!set.has(parentOf(p))) cover.push(p);
  }
  return cover.sort();
}

export function FilePickerTree({
  entries,
  checked,
  onChange,
}: {
  entries: FileEntry[];
  checked: string[];
  onChange: (next: string[]) => void;
}) {
  const roots = useMemo(() => buildTree(entries), [entries]);
  const allPaths = useMemo(() => entries.map((e) => e.relPath), [entries]);
  const descendants = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of entries) {
      if (!e.isDir) continue;
      m.set(e.relPath, allPaths.filter((p) => p === e.relPath || p.startsWith(e.relPath + "/")));
    }
    return m;
  }, [entries, allPaths]);

  const selected = useMemo(() => expandCover(checked, allPaths), [checked, allPaths]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const isChecked = (node: Node) => selected.has(node.path);
  const isIndeterminate = (node: Node) => {
    if (!node.isDir || selected.has(node.path)) return false;
    const desc = descendants.get(node.path) || [];
    return desc.some((p) => selected.has(p));
  };

  const toggle = (node: Node) => {
    const next = new Set(selected);
    const paths = node.isDir ? [node.path, ...(descendants.get(node.path) || [])] : [node.path];
    const turningOn = !selected.has(node.path);
    for (const p of paths) {
      if (turningOn) next.add(p);
      else next.delete(p);
    }
    onChange(minimalCover(next));
  };

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });
  };

  const renderNode = (node: Node, depth: number): React.ReactNode => {
    const open = expanded.has(node.path);
    return (
      <div key={node.path}>
        <div className="flex items-center gap-1.5 py-0.5 hover:bg-slate-800/50 rounded" style={{ paddingLeft: depth * 16 }}>
          {node.isDir ? (
            <button onClick={() => toggleExpand(node.path)} className="text-slate-400 hover:text-white">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-3.5" />
          )}
          <input
            type="checkbox"
            className="rounded bg-slate-900 border-slate-700 text-accentPurple focus:ring-accentPurple"
            checked={isChecked(node)}
            ref={(el) => { if (el) el.indeterminate = isIndeterminate(node); }}
            onChange={() => toggle(node)}
          />
          {node.isDir ? <Folder className="w-3.5 h-3.5 text-amber-400/80" /> : <FileIcon className="w-3.5 h-3.5 text-slate-400" />}
          <span className="text-xs text-slate-200 truncate">{node.name}</span>
        </div>
        {node.isDir && open && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  if (entries.length === 0) {
    return <div className="text-xs text-slate-500 py-6 text-center">No files found.</div>;
  }

  return <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-900/50 border border-white/5 p-2">{roots.map((n) => renderNode(n, 0))}</div>;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "FilePickerTree.tsx" || echo "no type errors in FilePickerTree"`
Expected: `no type errors in FilePickerTree`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/advisor/FilePickerTree.tsx
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: add tri-state FilePickerTree component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Wire the picker into CloudAdvisorModal

**Files:**
- Modify: `src/components/dashboard/advisor/CloudAdvisorModal.tsx`

**Interfaces:**
- Consumes: `FilePickerTree` (Task 8); tree API (Task 6); `putLink`, `isDirty`, `transfer` (existing).

- [ ] **Step 1: Imports and state**

At the top of `CloudAdvisorModal.tsx`, add to the imports:

```tsx
import { FilePickerTree } from "./FilePickerTree";
import type { FileEntry } from "@/lib/hosting/types";
```

Remove `excludeConfig` from the `LinkState` interface (delete the `excludeConfig: boolean;` line).

Change the `form` state initializer (remove `excludeConfig`):

```tsx
  const [form, setForm] = useState({ host: "", port: 22, username: "", password: "", remoteBasePath: "." });
```

Add picker state below the other transfer state:

```tsx
  const [picker, setPicker] = useState<null | { direction: "PUSH" | "PULL"; tree: FileEntry[]; checked: string[] }>(null);
```

- [ ] **Step 2: Fix loadLink and isDirty (drop excludeConfig)**

In `loadLink`, change the `setForm` call to drop `excludeConfig`:

```tsx
        setForm((f) => ({ ...f, host: body.link.host, port: body.link.port, username: body.link.username, remoteBasePath: body.link.remoteBasePath, password: "" }));
```

In `isDirty`, remove the `form.excludeConfig !== saved.excludeConfig` clause:

```tsx
  const isDirty = (): boolean =>
    !saved ||
    !!form.password ||
    form.host !== saved.host ||
    form.port !== saved.port ||
    form.username !== saved.username ||
    form.remoteBasePath !== saved.remoteBasePath;
```

- [ ] **Step 3: Replace the direct transfer trigger with the picker flow**

Add a `beginTransfer` function and a `confirmPicker` function next to `transfer` (keep the existing `transfer` as-is — it still performs the actual upload):

```tsx
  const beginTransfer = async (direction: "PUSH" | "PULL") => {
    setBusy(direction); setMessage(null);
    // Persist unsaved credential/config changes first (and, for PULL, validate
    // the connection) before we can list files.
    if (isDirty()) {
      const ok = await putLink();
      if (!ok) { setBusy(null); return; }
    }
    try {
      const res = await fetch(`/api/servers/${serverId}/transfer/tree?direction=${direction}`);
      const body = await res.json();
      if (!res.ok) { setMessage(body.error || "Failed to load file list"); setBusy(null); return; }
      const topLevel = (body.tree as FileEntry[]).filter((e) => !e.relPath.includes("/")).map((e) => e.relPath);
      const initial: string[] =
        body.includePaths.length ? body.includePaths
        : body.unknownGame ? topLevel
        : body.defaultPaths;
      setPicker({ direction, tree: body.tree, checked: initial });
    } finally {
      setBusy(null);
    }
  };

  const confirmPicker = async () => {
    if (!picker) return;
    const includePaths = picker.checked;
    setBusy(picker.direction);
    // Persist the selection, then run the transfer with it.
    const res = await fetch(`/api/servers/${serverId}/host-link`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, password: "", includePaths }),
    });
    if (!res.ok) { const b = await res.json(); setMessage(b.error || "Failed to save selection"); setBusy(null); return; }
    await loadLink();
    const dir = picker.direction;
    setPicker(null);
    setBusy(null);
    await transfer(dir);
  };
```

- [ ] **Step 4: Point the Push/Pull buttons at beginTransfer and remove the excludeConfig checkbox**

In the TRANSFER step JSX: change the two transfer buttons' `onClick` from `() => transfer("PUSH")` / `() => transfer("PULL")` to `() => beginTransfer("PUSH")` / `() => beginTransfer("PULL")`.

Delete the "Don't overwrite host config" checkbox label block:

```tsx
                <label className="flex items-center gap-2 text-xs text-slate-300 mt-2">
                  <input type="checkbox" checked={form.excludeConfig} onChange={(e) => setForm({ ...form, excludeConfig: e.target.checked })} className="rounded bg-slate-900 border-slate-700 text-accentPurple focus:ring-accentPurple" />
                  Don't overwrite host config (skip server.properties)
                </label>
```

- [ ] **Step 5: Render the picker overlay**

Inside the TRANSFER step container (just before its closing `</div>` that ends the step, after the `{message && ...}` line), add the picker panel:

```tsx
              {picker && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="w-full max-w-lg rounded-2xl bg-slate-950 border border-white/10 p-5 shadow-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-white">Select files to {picker.direction === "PUSH" ? "upload" : "download"}</h4>
                      <span className="text-[10px] text-slate-500">{picker.checked.length} selected</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">Defaults to your world-save files. Check folders to include everything inside them.</p>
                    <FilePickerTree
                      entries={picker.tree}
                      checked={picker.checked}
                      onChange={(next) => setPicker((p) => (p ? { ...p, checked: next } : p))}
                    />
                    <div className="flex gap-2 mt-4 justify-end">
                      <button onClick={() => { setPicker(null); setBusy(null); }} className="rounded-lg border border-slate-700 hover:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">Back</button>
                      <button onClick={confirmPicker} disabled={picker.checked.length === 0 || !!busy} className="rounded-lg bg-accentPurple hover:bg-purple-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white">Continue</button>
                    </div>
                  </div>
                </div>
              )}
```

- [ ] **Step 6: Verify it type-checks and no stale excludeConfig references remain**

Run: `grep -n excludeConfig src/components/dashboard/advisor/CloudAdvisorModal.tsx || echo clean`
Expected: `clean`.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "CloudAdvisorModal.tsx" || echo "no new type errors"`
Expected: only the pre-existing `sonner` module error, if any — no errors mentioning `excludeConfig`, `picker`, `beginTransfer`, or `FilePickerTree`.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/advisor/CloudAdvisorModal.tsx
git -c user.email="jimmymills@users.noreply.github.com" commit -m "feat: file-picker step for selective transfer, remove excludeConfig UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Full verification and PR

**Files:** none (verification only).

- [ ] **Step 1: Run the full hosting test suite**

Run: `npx vitest run src/lib/hosting`
Expected: PASS — all suites, including the new `worldSaveDefaults` and updated `syncEngine` / `transferService`.

- [ ] **Step 2: Type-check the changed surface**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "sftpClient|CloudAdvisorModal|FilePickerTree|transferService|syncEngine|worldSaveDefaults|host-link|transfer/route|transfer/tree"`
Expected: no output except possibly the pre-existing `sonner` missing-module error in `CloudAdvisorModal.tsx`. No `excludeConfig` errors.

- [ ] **Step 3: Build (best-effort, needs deps installed)**

Run: `npm run build`
Expected: build succeeds. If it fails only on unrelated pre-existing missing modules in this environment, note it; otherwise fix regressions in the touched files.

- [ ] **Step 4: Manual smoke test (documented, run by a human against a live host)**

1. Open a server → Cloud advisor → Sync/Transfer step with a saved Akliz link.
2. Click **Push to Cloud** → picker opens with the world-save folder pre-checked (Palworld → `palworld-server/Pal/Saved/SaveGames`).
3. Confirm only the save subtree uploads (progress labels stay within it; base install files are skipped).
4. Reopen → the picker remembers the selection.
5. Click **Pull from Cloud** → picker shows the **remote** tree; selection persists across the two directions.

- [ ] **Step 5: Push and open the PR (stacked on the password-fix PR)**

```bash
git push -u origin feat/selective-sftp-transfer
```

Open a PR with base `main` (note in the description that it builds on the password-fix branch `fix/sftp-transfer-use-typed-password` / PR #102 for the auto-save helper). Body covers: the include-path filter, per-game defaults (with the Palworld path), direction-aware tree, `excludeConfig` removal (behavior change for anyone who had it on), and the manual smoke test done.

---

## Self-Review Notes

- **Spec coverage:** UX picker (Tasks 8–9), per-game defaults inc. Palworld (Task 2), `includePaths` model + migration + `excludeConfig` drop (Task 4), engine include filter with DEFAULT_IGNORE floor (Task 1), direction-aware tree local/remote (Task 6), host-link persistence (Task 5), transfer wiring (Task 7), both-direction application (tree route + confirmPicker), tests (Tasks 1–3) — all mapped.
- **Type consistency:** `include: string[]` used in `TransferContext` (Task 3) and `planTransfer` (Task 1); `worldSaveDefaults`/`isKnownGame` defined in Task 2 and consumed in Task 6; `FilePickerTree` props defined in Task 8 and used in Task 9; `includePaths` JSON string in DB (Task 4) parsed identically in Tasks 5/6/7.
- **Known limitation (from spec):** Pull renders the remote tree but the persisted include-paths are shared with push; if the host's layout diverges from local, defaults may not pre-match — acceptable per spec since the mirror keeps layouts aligned.
