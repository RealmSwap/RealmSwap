# Discoverable Server File Locations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface where GameVault already stores its data — a global "File Locations" page plus a per-server "Open folder" button — so users can find, back up, and relocate their server files even if the app goes down.

**Architecture:** The renderer stays HTTP-only (no Electron IPC). All filesystem work happens in the Next.js server process via two new API routes backed by pure, unit-tested helpers. The on-disk layout and the SQLite source of truth are unchanged — this is discoverability only.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, Lucide icons, Prisma (SQLite), Vitest, Node `child_process.spawn`.

## Global Constraints

- **No change** to `dataRoot()` (`src/lib/appPaths.ts`) or the on-disk layout.
- **No** export of definitions/config out of the DB; the SQLite DB stays the source of truth.
- **No** Electron `preload.js` / IPC changes — renderer talks only to the local HTTP server.
- Pure helpers take an injected `root: string` parameter (follow the `getSavePath(game, id, roots)` pattern in `src/lib/backupPaths.ts`); routes inject `dataRoot()`.
- Client never supplies a raw filesystem path. The open-folder route resolves paths server-side from a whitelist key or an owned `serverId`, and asserts the result is inside `dataRoot()`.
- Auth on every route via `getAuthenticatedUser()` returning `401` when absent (match `src/app/api/system/metrics/route.ts`).
- Tests: `src/lib/__tests__/*.test.ts`, run with `npm test` (`vitest run`). Path assertions use `path.join(...)` so they pass cross-platform (follow `backupPaths.test.ts`).
- Canonical per-server directory is `<dataRoot>/local-servers/<serverId>` (same as snapshots/backups/logs). Per-server UI gated on `runnerType === "LOCAL"`.

---

### Task 1: Pure storage-location helpers

**Files:**
- Create: `src/lib/storageLocations.ts`
- Test: `src/lib/__tests__/storageLocations.test.ts`

**Interfaces:**
- Consumes: nothing (pure module; `path` only).
- Produces:
  - `interface StorageLocation { key: string; label: string; path: string; isFile?: boolean }`
  - `storageLocationPaths(root: string): StorageLocation[]`
  - `resolveStorageTarget(key: string, root: string): string | null`
  - `isInsideRoot(root: string, target: string): boolean`
  - `openFolderCommand(platform: NodeJS.Platform, target: string): { cmd: string; args: string[] }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/storageLocations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "path";
import {
  storageLocationPaths,
  resolveStorageTarget,
  isInsideRoot,
  openFolderCommand,
} from "../storageLocations";

const root = path.join("DATA");

describe("storageLocationPaths", () => {
  it("lists the well-known locations in order with absolute paths", () => {
    const locs = storageLocationPaths(root);
    expect(locs.map((l) => l.key)).toEqual([
      "dataRoot",
      "database",
      "servers",
      "backups",
      "snapshots",
      "steamcmd",
    ]);
    expect(locs.find((l) => l.key === "servers")!.path).toBe(
      path.join("DATA", "local-servers")
    );
    expect(locs.find((l) => l.key === "database")!).toMatchObject({
      path: path.join("DATA", "realmswap.db"),
      isFile: true,
    });
  });
});

describe("resolveStorageTarget", () => {
  it("resolves a folder key to its absolute path", () => {
    expect(resolveStorageTarget("backups", root)).toBe(
      path.join("DATA", "local-backups")
    );
  });

  it("resolves a file key (database) to its CONTAINING folder", () => {
    expect(resolveStorageTarget("database", root)).toBe(path.join("DATA"));
  });

  it("returns null for an unknown key", () => {
    expect(resolveStorageTarget("../etc", root)).toBeNull();
    expect(resolveStorageTarget("nope", root)).toBeNull();
  });
});

describe("isInsideRoot", () => {
  it("accepts the root itself and nested paths", () => {
    expect(isInsideRoot(root, root)).toBe(true);
    expect(isInsideRoot(root, path.join("DATA", "local-servers", "s1"))).toBe(true);
  });

  it("rejects traversal and sibling paths", () => {
    expect(isInsideRoot(root, path.join("DATA", "..", "secret"))).toBe(false);
    expect(isInsideRoot(root, path.join("OTHER"))).toBe(false);
  });
});

describe("openFolderCommand", () => {
  it("uses explorer on win32", () => {
    expect(openFolderCommand("win32", "C:\\x")).toEqual({ cmd: "explorer", args: ["C:\\x"] });
  });
  it("uses open on darwin", () => {
    expect(openFolderCommand("darwin", "/x")).toEqual({ cmd: "open", args: ["/x"] });
  });
  it("falls back to xdg-open elsewhere", () => {
    expect(openFolderCommand("linux", "/x")).toEqual({ cmd: "xdg-open", args: ["/x"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- storageLocations`
Expected: FAIL — cannot find module `../storageLocations`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/storageLocations.ts`:

```ts
import path from "path";

export interface StorageLocation {
  key: string;
  label: string;
  /** Absolute path. */
  path: string;
  /** When true this is a file; callers open its containing folder. */
  isFile?: boolean;
}

/**
 * Ordered list of well-known writable locations under the app data root.
 * Mirrors the layout produced across the app (local-servers, local-backups,
 * snapshots, steamcmd) plus the database file.
 */
export function storageLocationPaths(root: string): StorageLocation[] {
  return [
    { key: "dataRoot", label: "Data folder", path: root },
    { key: "database", label: "Database", path: path.join(root, "realmswap.db"), isFile: true },
    { key: "servers", label: "Servers", path: path.join(root, "local-servers") },
    { key: "backups", label: "Backups", path: path.join(root, "local-backups") },
    { key: "snapshots", label: "Snapshots", path: path.join(root, "snapshots") },
    { key: "steamcmd", label: "SteamCMD", path: path.join(root, "steamcmd") },
  ];
}

/**
 * Resolve a whitelisted location key to the absolute folder to open. File
 * targets resolve to their containing folder. Unknown keys return null.
 */
export function resolveStorageTarget(key: string, root: string): string | null {
  const loc = storageLocationPaths(root).find((l) => l.key === key);
  if (!loc) return null;
  return loc.isFile ? path.dirname(loc.path) : loc.path;
}

/** True if `target` equals the root or is nested inside it (blocks traversal). */
export function isInsideRoot(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  if (t === r) return true;
  const rel = path.relative(r, t);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** OS file-manager command that reveals a folder. */
export function openFolderCommand(
  platform: NodeJS.Platform,
  target: string
): { cmd: string; args: string[] } {
  if (platform === "win32") return { cmd: "explorer", args: [target] };
  if (platform === "darwin") return { cmd: "open", args: [target] };
  return { cmd: "xdg-open", args: [target] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- storageLocations`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storageLocations.ts src/lib/__tests__/storageLocations.test.ts
git commit -m "feat(storage): pure helpers for app data locations and open-folder command"
```

---

### Task 2: `GET /api/system/storage` route

**Files:**
- Create: `src/app/api/system/storage/route.ts`

**Interfaces:**
- Consumes: `storageLocationPaths` (Task 1), `dataRoot()` (`src/lib/appPaths.ts`), `getAuthenticatedUser` (`src/lib/auth.ts`).
- Produces: `GET` returning JSON `{ dataRoot: string, locations: Array<{ key, label, path, exists }> }`.

- [ ] **Step 1: Write the implementation**

Create `src/app/api/system/storage/route.ts`:

```ts
import { NextResponse } from "next/server";
import fs from "fs";
import { getAuthenticatedUser } from "@/lib/auth";
import { dataRoot } from "@/lib/appPaths";
import { storageLocationPaths } from "@/lib/storageLocations";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const root = dataRoot();
    const locations = storageLocationPaths(root).map((loc) => ({
      key: loc.key,
      label: loc.label,
      path: loc.path,
      exists: fs.existsSync(loc.path),
    }));

    return NextResponse.json({ dataRoot: root, locations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it builds and typechecks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/app/api/system/storage/route.ts`.

- [ ] **Step 3: Manual smoke (optional, deferred to final verification)**

With the dev app running and logged in, `GET http://localhost:3000/api/system/storage` returns `dataRoot` and the six locations with correct `exists` flags.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/system/storage/route.ts
git commit -m "feat(storage): GET /api/system/storage lists app data locations"
```

---

### Task 3: `POST /api/system/open-folder` route

**Files:**
- Create: `src/app/api/system/open-folder/route.ts`

**Interfaces:**
- Consumes: `resolveStorageTarget`, `isInsideRoot`, `openFolderCommand` (Task 1); `dataRoot()`; `getAuthenticatedUser`; `prisma` (`src/lib/db.ts`); `spawn` from `child_process`; `path`, `fs`.
- Produces: `POST` with body `{ target?: string; serverId?: string }` returning `{ ok: true }` or `{ ok: false, error }` (HTTP 400 on bad input/outside-root, 404 on missing server, 401 unauth).

- [ ] **Step 1: Write the implementation**

Create `src/app/api/system/open-folder/route.ts`:

```ts
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dataRoot } from "@/lib/appPaths";
import {
  resolveStorageTarget,
  isInsideRoot,
  openFolderCommand,
} from "@/lib/storageLocations";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const root = dataRoot();
    let target: string | null = null;

    if (typeof body.serverId === "string" && body.serverId) {
      const server = await prisma.server.findUnique({ where: { id: body.serverId } });
      if (!server || server.userId !== user.id) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }
      target = path.join(root, "local-servers", server.id);
    } else if (typeof body.target === "string" && body.target) {
      target = resolveStorageTarget(body.target, root);
    }

    if (!target) {
      return NextResponse.json({ error: "Unknown target" }, { status: 400 });
    }
    if (!isInsideRoot(root, target)) {
      return NextResponse.json({ error: "Target outside data folder" }, { status: 400 });
    }
    if (!fs.existsSync(target)) {
      return NextResponse.json(
        { ok: false, error: "This folder doesn't exist yet. It's created the first time it's used." },
        { status: 200 }
      );
    }

    const { cmd, args } = openFolderCommand(process.platform, target);
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.unref();

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it builds and typechecks**

Run: `npx tsc --noEmit`
Expected: no errors referencing the new route.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/system/open-folder/route.ts
git commit -m "feat(storage): POST /api/system/open-folder reveals a whitelisted or per-server folder"
```

---

### Task 4: Shared dashboard nav constant + "File Locations" entry

**Files:**
- Create: `src/components/dashboardNavLinks.ts`
- Modify: `src/components/DashboardView.tsx` (the `[...].map(...)` "Features" nav array, ~lines 554-574)
- Modify: each other view that duplicates the same "Features" nav array: `src/components/AuditLogsView.tsx`, `src/components/BackupsView.tsx`, `src/components/ConfigEditorView.tsx`, `src/components/ConsoleView.tsx`, `src/components/CreateServerView.tsx`, `src/components/MarketplaceView.tsx`, `src/components/ModsView.tsx`, `src/components/SchedulesView.tsx`, `src/components/TeamView.tsx`

**Interfaces:**
- Consumes: Lucide icon components.
- Produces: `DASHBOARD_NAV_LINKS: Array<{ label: string; icon: LucideIcon; href: string }>` — consumed by every dashboard view's "Features" nav section.

- [ ] **Step 1: Create the shared constant**

Create `src/components/dashboardNavLinks.ts`:

```ts
import {
  Wrench,
  FolderSync,
  Settings,
  Terminal,
  Clock,
  Users,
  History,
  HardDrive,
  type LucideIcon,
} from "lucide-react";

export interface DashboardNavLink {
  label: string;
  icon: LucideIcon;
  href: string;
}

/**
 * The "Features" sidebar links shared by every dashboard view. Each view marks
 * its own entry active by comparing `href` to its current route.
 */
export const DASHBOARD_NAV_LINKS: DashboardNavLink[] = [
  { label: "Mod Manager", icon: Wrench, href: "/dashboard/mods" },
  { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
  { label: "Server Config", icon: Settings, href: "/dashboard/config" },
  { label: "Server Console", icon: Terminal, href: "/dashboard/console" },
  { label: "Schedules", icon: Clock, href: "/dashboard/schedules" },
  { label: "Team Members", icon: Users, href: "/dashboard/team" },
  { label: "Audit Logs", icon: History, href: "/dashboard/logs" },
  { label: "File Locations", icon: HardDrive, href: "/dashboard/storage" },
];
```

- [ ] **Step 2: Wire it into DashboardView**

In `src/components/DashboardView.tsx`, add the import near the other imports:

```ts
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";
```

Replace the inline `[ { label: "Mod Manager", ... }, ... ].map((link, i) => (` array literal (the "Features" section, ~lines 554-565) with `DASHBOARD_NAV_LINKS.map((link, i) => (`, leaving the existing JSX inside `.map(...)` unchanged. For the active state, set the rendered link's classes based on `link.href === "/dashboard"` style matching the page — DashboardView's own page is `/dashboard`, which is not in the Features list, so no Features entry is active here (matches current behavior).

- [ ] **Step 3: Wire it into the other eight views**

In each of `AuditLogsView.tsx`, `BackupsView.tsx`, `ConfigEditorView.tsx`, `ConsoleView.tsx`, `CreateServerView.tsx`, `MarketplaceView.tsx`, `ModsView.tsx`, `SchedulesView.tsx`, `TeamView.tsx`:

1. Add `import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";`.
2. Replace the inline "Features" array literal in the `.map(...)` with `DASHBOARD_NAV_LINKS`.
3. Preserve each view's existing active-state highlight. These views currently set `active: true` inline on their own entry. After the swap, compute active by comparing `link.href` to the view's route inside the map. Concretely, change the `<Link>` className expression to highlight when active, e.g. for `BackupsView` (route `/dashboard/backups`):

```tsx
{DASHBOARD_NAV_LINKS.map((link, i) => {
  const active = link.href === "/dashboard/backups";
  return (
    <Link
      key={i}
      href={link.href}
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all group ${
        active
          ? "bg-accentPurple/10 text-white border border-accentPurple/20"
          : "hover:bg-white/5 text-slate-400 hover:text-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <link.icon className={`w-4 h-4 ${active ? "text-accentPurple" : "text-slate-500 group-hover:text-white"} transition-colors`} />
        <span>{link.label}</span>
      </div>
    </Link>
  );
})}
```

Use the matching route string per view: `mods → /dashboard/mods`, `config → /dashboard/config`, `console → /dashboard/console`, `schedules → /dashboard/schedules`, `team → /dashboard/team`, `logs → /dashboard/logs`. `CreateServerView` and `MarketplaceView` have their own top-level active links, so none of the Features entries is active there — use `const active = false;` (or compare to a non-matching route).

- [ ] **Step 4: Verify build/typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Visually confirm later that every dashboard page shows the new "File Locations" item in the sidebar.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboardNavLinks.ts src/components/*View.tsx
git commit -m "refactor(nav): share dashboard nav links and add File Locations entry"
```

---

### Task 5: Global "File Locations" page

**Files:**
- Create: `src/app/dashboard/storage/page.tsx`
- Create: `src/components/StorageView.tsx`

**Interfaces:**
- Consumes: `GET /api/system/storage` and `POST /api/system/open-folder` (Tasks 2-3); `DASHBOARD_NAV_LINKS` (Task 4); `useToast` (`@/components/ToastProvider`).
- Produces: a client component `StorageView` rendering the locations with Copy + Open actions.

- [ ] **Step 1: Create the page wrapper**

Create `src/app/dashboard/storage/page.tsx` (mirror `src/app/dashboard/backups/page.tsx`):

```tsx
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import StorageView from "@/components/StorageView";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }
  return <StorageView user={user} />;
}
```

- [ ] **Step 2: Create the StorageView component**

Create `src/components/StorageView.tsx`:

```tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Plus,
  Store,
  HardDrive,
  Copy,
  Check,
  FolderOpen,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";
import { useToast } from "@/components/ToastProvider";

interface Location {
  key: string;
  label: string;
  path: string;
  exists: boolean;
}

export default function StorageView({ user }: { user: any }) {
  const { addToast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system/storage")
      .then((r) => r.json())
      .then((d) => {
        setLocations(d.locations || []);
      })
      .catch(() => addToast("error", "Could not load file locations"))
      .finally(() => setLoading(false));
  }, [addToast]);

  const handleCopy = (loc: Location) => {
    navigator.clipboard.writeText(loc.path);
    setCopiedKey(loc.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpen = async (loc: Location) => {
    try {
      const res = await fetch("/api/system/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: loc.key }),
      });
      const data = await res.json();
      if (!data.ok) addToast("error", data.error || "Could not open folder");
    } catch {
      addToast("error", "Could not open folder");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#06070b] text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col hidden md:flex">
        <div className="p-6 border-b border-borderDark flex items-center gap-2">
          <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
        </div>
        <nav className="p-4 space-y-1">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
            <LayoutDashboard className="w-4 h-4 text-mutedText group-hover:text-white" />
            <span>Dashboard</span>
          </Link>
          <Link href="/dashboard/servers/new" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
            <Plus className="w-4 h-4 text-mutedText group-hover:text-white" />
            <span>Create Server</span>
          </Link>
          <Link href="/dashboard/marketplace" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
            <Store className="w-4 h-4 text-mutedText group-hover:text-white" />
            <span>Marketplace</span>
          </Link>
          <div className="pt-4 pb-2 px-3">
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider">Features</span>
          </div>
          {DASHBOARD_NAV_LINKS.map((link, i) => {
            const active = link.href === "/dashboard/storage";
            return (
              <Link
                key={i}
                href={link.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all group ${
                  active
                    ? "bg-accentPurple/10 text-white border border-accentPurple/20"
                    : "hover:bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <link.icon className={`w-4 h-4 ${active ? "text-accentPurple" : "text-slate-500 group-hover:text-white"} transition-colors`} />
                  <span>{link.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-2">
          <HardDrive className="w-6 h-6 text-accentPurple" />
          <h1 className="text-2xl font-bold">File Locations</h1>
        </div>
        <p className="text-sm text-mutedText mb-6 leading-relaxed max-w-2xl">
          All your servers, worlds, and backups live in this folder. If the app ever stops
          working, your data is safe here — copy this folder to back it up, or move it to
          another machine to keep hosting your games.
        </p>

        {loading ? (
          <div className="text-mutedText text-sm">Loading…</div>
        ) : (
          <div className="space-y-3">
            {locations.map((loc) => (
              <div
                key={loc.key}
                className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/40 border border-white/5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold">{loc.label}</div>
                  <div className="text-xs text-mutedText font-mono truncate">{loc.path}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(loc)}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-white/5 hover:border-accentPurple/40 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                    title="Copy path"
                  >
                    {copiedKey === loc.key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === loc.key ? "Copied" : "Copy"}</span>
                  </button>
                  <button
                    onClick={() => handleOpen(loc)}
                    disabled={!loc.exists}
                    title={loc.exists ? "Open in file manager" : "Created the first time it's used"}
                    className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                      loc.exists
                        ? "bg-accentPurple/10 border border-accentPurple/20 text-accentPurple hover:bg-accentPurple/20"
                        : "bg-slate-800/40 border border-white/5 text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

Note: the toast API is `const { addToast } = useToast();` with signature `addToast(type: "success" | "error" | "info", message: string)` (see `src/components/ToastProvider.tsx`) — already used above.

- [ ] **Step 3: Verify build/typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `StorageView.tsx` or `storage/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/storage/page.tsx src/components/StorageView.tsx
git commit -m "feat(storage): File Locations page with copy and open-folder actions"
```

---

### Task 6: Per-server "Open folder" button

**Files:**
- Modify: `src/components/DashboardView.tsx` (server card actions, next to the Export `<a>` ~lines 942-948)
- Modify: `src/components/ConsoleView.tsx` (single-server header actions)

**Interfaces:**
- Consumes: `POST /api/system/open-folder` with `{ serverId }`; `useToast`; Lucide `FolderOpen`.
- Produces: an "Open folder" control shown only when `server.runnerType === "LOCAL"`.

- [ ] **Step 1: Add a shared open handler in DashboardView**

In `src/components/DashboardView.tsx`, add `FolderOpen` to the existing `lucide-react` import, then add a handler near `handleCopyIp`. The component already destructures `const { addToast } = useToast();` (~line 139), so use `addToast`:

```tsx
const handleOpenServerFolder = async (serverId: string) => {
  try {
    const res = await fetch("/api/system/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId }),
    });
    const data = await res.json();
    if (!data.ok) addToast("error", data.error || "Could not open server folder");
  } catch {
    addToast("error", "Could not open server folder");
  }
};
```

- [ ] **Step 2: Render the button for local servers**

Immediately before the `{/* Export Realm */}` block in the server card, add:

```tsx
{server.runnerType === "LOCAL" && (
  <button
    onClick={() => handleOpenServerFolder(server.id)}
    disabled={isServerLoading || server.status === "STARTING"}
    className={`px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition-all ${isServerLoading || server.status === "STARTING" ? "opacity-50 pointer-events-none" : ""}`}
    title="Open this server's files on disk"
  >
    <FolderOpen className="w-3.5 h-3.5" />
    <span>Files</span>
  </button>
)}
```

- [ ] **Step 3: Add the same control to ConsoleView**

In `src/components/ConsoleView.tsx`, add `FolderOpen` to the `lucide-react` import and add `import { useToast } from "@/components/ToastProvider";` plus `const { addToast } = useToast();` (this component does not currently use toasts). Add the same `handleOpenServerFolder` handler (using `addToast` exactly as in DashboardView above). The currently selected server is held in the existing `selectedServer` state (`const [selectedServer, setSelectedServer] = useState(...)`, ~line 34). Render a "Files" button in the single-server header action row, gated on `selectedServer?.runnerType === "LOCAL"`:

```tsx
{selectedServer?.runnerType === "LOCAL" && (
  <button
    onClick={() => handleOpenServerFolder(selectedServer.id)}
    className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition-all"
    title="Open this server's files on disk"
  >
    <FolderOpen className="w-3.5 h-3.5" />
    <span>Files</span>
  </button>
)}
```

- [ ] **Step 4: Verify build/typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardView.tsx src/components/ConsoleView.tsx
git commit -m "feat(storage): per-server Open folder button for local servers"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass, including the new `storageLocations` suite.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke in the Electron app**

Launch the app (per the project's run flow). Then:
1. Open every dashboard page → confirm the sidebar shows **File Locations**.
2. Open **File Locations** → confirm the data folder + 5 sub-locations show correct paths; **Copy** copies the path; **Open** launches the OS file manager at the right folder; a not-yet-created folder shows a disabled Open with the tooltip.
3. On a **local** server card, click **Files** → Explorer opens that server's `local-servers/<id>` folder. On a **cloud** server, confirm no Files button appears.
4. For a local server created but never run, click **Files** → a toast explains the folder doesn't exist yet (no crash).

- [ ] **Step 4: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "test(storage): verify file-location discoverability end to end"
```
