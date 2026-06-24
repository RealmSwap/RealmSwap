# Download Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live download/install progress bar with a phase label on each server's dashboard card while it is `STARTING` or `UPDATING`.

**Architecture:** A dependency-free in-memory progress store (`globalThis`-backed Map) is fed by the local runner as it parses SteamCMD stdout and HTTP `content-length` byte counts. A new authenticated polling endpoint exposes the store, and the dashboard card polls it (~1.5s) for any starting/updating server and renders a determinate or indeterminate bar.

**Tech Stack:** Next.js 14 (App Router), React (client component), TypeScript, Node `child_process`/`https`, Vitest. Windows-only runner.

## Global Constraints

- **No database schema change** — progress lives only in memory.
- **No new dependencies** — use existing `https`, `child_process`, React, Vitest.
- Follow existing API-route auth pattern: `getAuthenticatedUser()` then `verifyServerAccess(serverId, user.id)` (see `src/app/api/servers/[id]/logs/route.ts`).
- Path aliases: import app/lib code with `@/lib/...`; the runner uses relative imports (`./db`, etc.).
- Test command: `npx vitest run`. Typecheck command: `npx tsc --noEmit`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- `percent: null` always means "indeterminate" (unknown size / non-download phase).

---

### Task 1: Progress store module + pure helpers

**Files:**
- Create: `src/lib/downloadProgress.ts`
- Test: `src/lib/__tests__/downloadProgress.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `interface ProgressState { phase: string; percent: number | null; label: string; updatedAt: number }`
  - `setProgress(serverId: string, partial: Partial<ProgressState>): void`
  - `getProgress(serverId: string): ProgressState | null`
  - `clearProgress(serverId: string): void`
  - `parseSteamProgress(line: string): number | null`
  - `computePercent(received: number, total: number): number | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/downloadProgress.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  parseSteamProgress,
  computePercent,
  setProgress,
  getProgress,
  clearProgress,
} from "../downloadProgress";

describe("parseSteamProgress", () => {
  it("extracts the percent from a steam download line", () => {
    expect(
      parseSteamProgress("Update state (0x61) downloading, progress: 42.66 (123 / 456)")
    ).toBeCloseTo(42.66);
  });
  it("parses an integer-valued progress", () => {
    expect(parseSteamProgress("progress: 100.00 (456 / 456)")).toBe(100);
  });
  it("returns null when there is no progress token", () => {
    expect(parseSteamProgress("Logging in user ... OK")).toBeNull();
  });
  it("returns null for a malformed progress value", () => {
    expect(parseSteamProgress("progress: abc")).toBeNull();
  });
  it("clamps values above 100", () => {
    expect(parseSteamProgress("progress: 150.0")).toBe(100);
  });
});

describe("computePercent", () => {
  it("computes a normal ratio", () => {
    expect(computePercent(50, 200)).toBe(25);
  });
  it("returns null when total is zero", () => {
    expect(computePercent(10, 0)).toBeNull();
  });
  it("returns null when total is negative", () => {
    expect(computePercent(10, -5)).toBeNull();
  });
  it("returns null when total is not finite", () => {
    expect(computePercent(10, NaN)).toBeNull();
  });
  it("clamps when received exceeds total", () => {
    expect(computePercent(300, 200)).toBe(100);
  });
});

describe("progress store", () => {
  beforeEach(() => clearProgress("srv1"));

  it("returns null when nothing is set", () => {
    expect(getProgress("srv1")).toBeNull();
  });
  it("stores and retrieves progress", () => {
    setProgress("srv1", { phase: "steam", percent: 10, label: "Downloading 10%" });
    const p = getProgress("srv1");
    expect(p?.phase).toBe("steam");
    expect(p?.percent).toBe(10);
    expect(p?.label).toBe("Downloading 10%");
    expect(p?.updatedAt).toBeGreaterThan(0);
  });
  it("merges partial updates (keeps existing phase, overwrites percent)", () => {
    setProgress("srv1", { phase: "steam", percent: 10, label: "Downloading 10%" });
    setProgress("srv1", { percent: 55, label: "Downloading 55%" });
    const p = getProgress("srv1");
    expect(p?.phase).toBe("steam");
    expect(p?.percent).toBe(55);
    expect(p?.label).toBe("Downloading 55%");
  });
  it("stores a null percent (indeterminate)", () => {
    setProgress("srv1", { phase: "extract", percent: null, label: "Extracting…" });
    expect(getProgress("srv1")?.percent).toBeNull();
  });
  it("clears progress", () => {
    setProgress("srv1", { percent: 10 });
    clearProgress("srv1");
    expect(getProgress("srv1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/downloadProgress.test.ts`
Expected: FAIL — cannot resolve `../downloadProgress` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/downloadProgress.ts`:

```ts
export interface ProgressState {
  phase: string;          // e.g. "steam", "download", "extract", "script"
  percent: number | null; // 0..100, or null = indeterminate
  label: string;          // human label, e.g. "Downloading Valheim 42%"
  updatedAt: number;      // epoch ms
}

// globalThis-backed so the store survives Next.js dev hot-reloads (same pattern as
// localProcesses in localRunner.ts).
const globalForProgress = globalThis as unknown as {
  downloadProgress: Map<string, ProgressState> | undefined;
};

if (!globalForProgress.downloadProgress) {
  globalForProgress.downloadProgress = new Map();
}

const store = globalForProgress.downloadProgress;

export function setProgress(serverId: string, partial: Partial<ProgressState>): void {
  const existing = store.get(serverId) ?? { phase: "", percent: null, label: "", updatedAt: 0 };
  store.set(serverId, {
    phase: partial.phase ?? existing.phase,
    // Use `!== undefined` so an explicit null (indeterminate) is honored.
    percent: partial.percent !== undefined ? partial.percent : existing.percent,
    label: partial.label ?? existing.label,
    updatedAt: Date.now(),
  });
}

export function getProgress(serverId: string): ProgressState | null {
  return store.get(serverId) ?? null;
}

export function clearProgress(serverId: string): void {
  store.delete(serverId);
}

// Extracts the numeric progress from a SteamCMD status line, e.g.
// "Update state (0x61) downloading, progress: 42.66 (123 / 456)" -> 42.66
export function parseSteamProgress(line: string): number | null {
  const m = line.match(/progress:\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!Number.isFinite(val)) return null;
  return Math.max(0, Math.min(100, val));
}

// Returns received/total as a 0..100 percent, or null when total is unknown/invalid.
export function computePercent(received: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(received) || received < 0) return null;
  return Math.max(0, Math.min(100, (received / total) * 100));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/downloadProgress.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/downloadProgress.ts src/lib/__tests__/downloadProgress.test.ts
git commit -m "$(printf 'feat: in-memory download progress store with steam/http parsers\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: Wire progress into the local runner

**Files:**
- Modify: `src/lib/localRunner.ts`

**Interfaces:**
- Consumes (from Task 1): `setProgress`, `clearProgress`, `parseSteamProgress`, `computePercent`.
- Produces:
  - `downloadFile(url, dest, onProgress?)` where `onProgress?: (percent: number | null) => void`.
  - `installSteamCmdApp(serverId, appId, appName, installDir, checkFile, requiredGB, onLog, onProgress?)` where `onProgress?: (p: { percent: number | null; label: string }) => void`.

This task has no new unit tests (it integrates child_process/network/Prisma). Verification is typecheck + the Task 1 suite staying green + a manual smoke note. Make every edit, then verify once at the end.

- [ ] **Step 1: Add the import**

At the top of `src/lib/localRunner.ts`, after the existing `import type { GameDefinitionSpec } from "./definitions/types";` line, add:

```ts
import { setProgress, clearProgress, parseSteamProgress, computePercent } from "./downloadProgress";
```

- [ ] **Step 2: Add progress reporting to `downloadFile`**

Replace the entire current `downloadFile` function with:

```ts
// Download utility. onProgress receives a 0..100 percent, or null when the
// server does not send a Content-Length header (indeterminate).
function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number | null) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      const total = parseInt(response.headers["content-length"] || "", 10);
      let received = 0;
      let lastEmit = 0;
      if (onProgress) onProgress(computePercent(received, total));
      response.on("data", (chunk) => {
        received += chunk.length;
        const now = Date.now();
        // Throttle to ~4x/sec to avoid spamming the store on every chunk.
        if (onProgress && now - lastEmit >= 250) {
          lastEmit = now;
          onProgress(computePercent(received, total));
        }
      });
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        if (onProgress) onProgress(computePercent(received, total));
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {}); // Delete partial file
      reject(err);
    });
  });
}
```

- [ ] **Step 3: Add the `onProgress` parameter to `installSteamCmdApp`**

In `installSteamCmdApp`, change the signature. Replace:

```ts
  requiredGB: number,
  onLog: (msg: string) => void
): Promise<void> {
```

with:

```ts
  requiredGB: number,
  onLog: (msg: string) => void,
  onProgress?: (p: { percent: number | null; label: string }) => void
): Promise<void> {
```

- [ ] **Step 4: Emit setup/update phase labels inside `installSteamCmdApp`**

In `installSteamCmdApp`, replace these two lines:

```ts
      const steamcmdExe = await setupSteamCMD(onLog);
      await ensureSteamCmdUpdated(steamcmdExe, onLog);
```

with:

```ts
      onProgress?.({ percent: null, label: "Setting up SteamCMD…" });
      const steamcmdExe = await setupSteamCMD(onLog);
      onProgress?.({ percent: null, label: "Updating SteamCMD…" });
      await ensureSteamCmdUpdated(steamcmdExe, onLog);
```

- [ ] **Step 5: Parse download percent in the SteamCMD stdout handler**

In `installSteamCmdApp`, replace the stdout handler:

```ts
      child.stdout.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          const cleanLine = line.replace(/[\r\n]+/g, " ");
          if (/ERROR!|Failed to install|No subscription|Invalid Password|Disk write failure/i.test(cleanLine)) {
            steamErrorDetail = cleanLine;
            onLog(`[SteamCMD Error] ${cleanLine}`);
          } else if (cleanLine.includes("progress") || cleanLine.includes("Downloading") || cleanLine.includes("Update state")) {
            onLog(`[SteamCMD Status] ${cleanLine}`);
          }
        }
      });
```

with:

```ts
      child.stdout.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          const cleanLine = line.replace(/[\r\n]+/g, " ");
          const pct = parseSteamProgress(cleanLine);
          if (pct !== null) {
            onProgress?.({ percent: pct, label: `Downloading ${appName} ${Math.round(pct)}%` });
          }
          if (/ERROR!|Failed to install|No subscription|Invalid Password|Disk write failure/i.test(cleanLine)) {
            steamErrorDetail = cleanLine;
            onLog(`[SteamCMD Error] ${cleanLine}`);
          } else if (cleanLine.includes("progress") || cleanLine.includes("Downloading") || cleanLine.includes("Update state")) {
            onLog(`[SteamCMD Status] ${cleanLine}`);
          }
        }
      });
```

- [ ] **Step 6: Pass the progress callback when installing via SteamCMD**

In `startLocalServer`, inside the `if (installPlan.method === "STEAMCMD")` block, replace:

```ts
        await prisma.server.update({ where: { id: serverId }, data: { status: "STARTING" } });
        await installSteamCmdApp(
          serverId,
          installPlan.appId!,
          server.name,
          installDir,
          installPlan.checkFile!,
          installPlan.requiredDiskGB ?? 3,
          logWriter
        );
```

with:

```ts
        await prisma.server.update({ where: { id: serverId }, data: { status: "STARTING" } });
        setProgress(serverId, { phase: "steam", percent: null, label: "Setting up SteamCMD…" });
        await installSteamCmdApp(
          serverId,
          installPlan.appId!,
          server.name,
          installDir,
          installPlan.checkFile!,
          installPlan.requiredDiskGB ?? 3,
          logWriter,
          (p) => setProgress(serverId, { phase: "steam", percent: p.percent, label: p.label })
        );
```

- [ ] **Step 7: Report progress for the DOWNLOAD method**

In `startLocalServer`, inside the `else if (installPlan.method === "DOWNLOAD")` block, replace:

```ts
        await prisma.server.update({ where: { id: serverId }, data: { status: "STARTING" } });
        logWriter("Server binary not found. Downloading...");
        await downloadFile(installPlan.url!, target);
        logWriter("Download completed successfully.");
        // Unzip if needed (e.g. zip archives)
        if (installPlan.unzip) {
          logWriter("Extracting archive using Windows PowerShell...");
```

with:

```ts
        await prisma.server.update({ where: { id: serverId }, data: { status: "STARTING" } });
        logWriter("Server binary not found. Downloading...");
        setProgress(serverId, { phase: "download", percent: null, label: `Downloading ${server.name}…` });
        await downloadFile(installPlan.url!, target, (pct) =>
          setProgress(serverId, {
            phase: "download",
            percent: pct,
            label: pct === null ? `Downloading ${server.name}…` : `Downloading ${server.name} ${Math.round(pct)}%`,
          })
        );
        logWriter("Download completed successfully.");
        // Unzip if needed (e.g. zip archives)
        if (installPlan.unzip) {
          setProgress(serverId, { phase: "extract", percent: null, label: "Extracting…" });
          logWriter("Extracting archive using Windows PowerShell...");
```

- [ ] **Step 8: Report progress for the CUSTOM_SCRIPT method**

In `startLocalServer`, replace:

```ts
  } else if (installPlan.method === "CUSTOM_SCRIPT") {
    await runShellScript(installPlan.installScript!, installDir, logWriter);
  }
```

with:

```ts
  } else if (installPlan.method === "CUSTOM_SCRIPT") {
    setProgress(serverId, { phase: "script", percent: null, label: "Running install script…" });
    await runShellScript(installPlan.installScript!, installDir, logWriter);
  }
```

- [ ] **Step 9: Clear progress once the process is spawned**

In `startLocalServer`, immediately after:

```ts
  if (!child.pid) throw new Error("Failed to spawn server child process.");
  localProcesses.set(serverId, child);
```

add:

```ts
  clearProgress(serverId);
```

- [ ] **Step 10: Clear progress on process exit/crash**

In `handleProcessExit`, immediately after:

```ts
  localProcesses.delete(serverId);
  stopMonitoring(serverId);
```

add:

```ts
  clearProgress(serverId);
```

- [ ] **Step 11: Wire progress into `updateGameServer`**

In `updateGameServer`, replace:

```ts
    await prisma.server.update({
      where: { id: serverId },
      data: { status: "UPDATING" },
    });

    logWriter(`[Update] Starting SteamCMD update for ${server.game} (App ID: ${installPlan.appId})...`);

    const steamcmdExe = await setupSteamCMD(logWriter);
    await ensureSteamCmdUpdated(steamcmdExe, logWriter);
```

with:

```ts
    await prisma.server.update({
      where: { id: serverId },
      data: { status: "UPDATING" },
    });

    logWriter(`[Update] Starting SteamCMD update for ${server.game} (App ID: ${installPlan.appId})...`);

    setProgress(serverId, { phase: "steam", percent: null, label: "Setting up SteamCMD…" });
    const steamcmdExe = await setupSteamCMD(logWriter);
    setProgress(serverId, { phase: "steam", percent: null, label: "Updating SteamCMD…" });
    await ensureSteamCmdUpdated(steamcmdExe, logWriter);
```

- [ ] **Step 12: Parse update download percent in `updateGameServer`'s stdout handler**

In `updateGameServer`, replace:

```ts
      child.stdout.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          const cleanLine = line.replace(/[\r\n]+/g, " ");
          if (/ERROR!|Failed to install|No subscription|Invalid Password|Disk write failure/i.test(cleanLine)) {
            steamErrorDetail = cleanLine;
            logWriter(`[Update Error] ${cleanLine}`);
          } else if (cleanLine.includes("progress") || cleanLine.includes("Downloading") || cleanLine.includes("Update state") || cleanLine.includes("Success")) {
            logWriter(`[Update Status] ${cleanLine}`);
          }
        }
      });
```

with:

```ts
      child.stdout.on("data", (data) => {
        const line = data.toString().trim();
        if (line) {
          const cleanLine = line.replace(/[\r\n]+/g, " ");
          const pct = parseSteamProgress(cleanLine);
          if (pct !== null) {
            setProgress(serverId, {
              phase: "steam",
              percent: pct,
              label: `Updating ${server.game} ${Math.round(pct)}%`,
            });
          }
          if (/ERROR!|Failed to install|No subscription|Invalid Password|Disk write failure/i.test(cleanLine)) {
            steamErrorDetail = cleanLine;
            logWriter(`[Update Error] ${cleanLine}`);
          } else if (cleanLine.includes("progress") || cleanLine.includes("Downloading") || cleanLine.includes("Update state") || cleanLine.includes("Success")) {
            logWriter(`[Update Status] ${cleanLine}`);
          }
        }
      });
```

- [ ] **Step 13: Clear progress in `updateGameServer` success and error paths**

In `updateGameServer`, in the success path replace:

```ts
    await prisma.server.update({
      where: { id: serverId },
      data: { status: "STOPPED" },
    });

    await prisma.activityLog.create({
```

with:

```ts
    clearProgress(serverId);

    await prisma.server.update({
      where: { id: serverId },
      data: { status: "STOPPED" },
    });

    await prisma.activityLog.create({
```

Then in the `catch (err: any)` block replace:

```ts
  } catch (err: any) {
    logWriter(`[Update] Update failed: ${err.message}`);
```

with:

```ts
  } catch (err: any) {
    clearProgress(serverId);
    logWriter(`[Update] Update failed: ${err.message}`);
```

- [ ] **Step 14: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS — all prior tests plus Task 1's `downloadProgress` tests (no regressions).

- [ ] **Step 15: Commit**

```bash
git add src/lib/localRunner.ts
git commit -m "$(printf 'feat: report install/download progress from the local runner\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: Progress polling endpoint

**Files:**
- Create: `src/app/api/servers/[id]/progress/route.ts`

**Interfaces:**
- Consumes (from Task 1): `getProgress`.
- Produces: `GET /api/servers/[id]/progress` → `200 { status: string, progress: ProgressState | null }`, `401`, `404`, or `500`.

- [ ] **Step 1: Create the route**

Create `src/app/api/servers/[id]/progress/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getProgress } from "@/lib/downloadProgress";
import { verifyServerAccess } from "@/lib/serverAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;

    const access = await verifyServerAccess(serverId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }
    const { server } = access;

    return NextResponse.json({
      status: server.status,
      progress: getProgress(serverId),
    });
  } catch (error) {
    console.error("GET /api/servers/[id]/progress error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/servers/[id]/progress/route.ts
git commit -m "$(printf 'feat: add server install-progress polling endpoint\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: Dashboard card progress bar

**Files:**
- Modify: `src/components/DashboardView.tsx`

**Interfaces:**
- Consumes (from Task 3): `GET /api/servers/{id}/progress` → `{ status, progress }`.
- Produces: UI only.

This task is a React client component; verify with typecheck + a manual UI note (start a SteamCMD game and a direct-download game; confirm the bar advances and disappears on completion).

- [ ] **Step 1: Add progress state**

In `src/components/DashboardView.tsx`, immediately after the `serverStats` state declaration:

```ts
  // Stats history for sparklines
  const [serverStats, setServerStats] = useState<Record<string, { cpu: number[]; memory: number[] }>>({});
```

add:

```ts
  // Live install/download progress for STARTING/UPDATING servers
  const [progressMap, setProgressMap] = useState<
    Record<string, { phase: string; percent: number | null; label: string } | null>
  >({});
```

- [ ] **Step 2: Add the progress polling effect**

In `src/components/DashboardView.tsx`, immediately after the "Poll stats for running servers" `useEffect` (the one that ends with `}, [data.servers]);` right before `// Update game server handler`), add:

```ts
  // Poll install/download progress for servers that are STARTING or UPDATING
  useEffect(() => {
    const inProgress = data.servers.filter(
      (s: any) => s.status === "STARTING" || s.status === "UPDATING"
    );
    if (inProgress.length === 0) {
      return;
    }
    const fetchProgress = async () => {
      for (const server of inProgress) {
        try {
          const res = await fetch(`/api/servers/${server.id}/progress`);
          if (res.ok) {
            const body = await res.json();
            setProgressMap((prev) => ({ ...prev, [server.id]: body.progress }));
          }
        } catch (e) {}
      }
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 1500);
    return () => clearInterval(interval);
  }, [data.servers]);
```

- [ ] **Step 3: Render the progress bar in the card**

In `src/components/DashboardView.tsx`, find the server-card markup and the line:

```tsx
                    {/* Hardware meters with sparklines */}
```

Immediately **before** that comment line, insert:

```tsx
                    {/* Live install/download progress */}
                    {(server.status === "STARTING" || server.status === "UPDATING") &&
                      progressMap[server.id] && (
                        <div className="mt-4">
                          <div className="flex items-center gap-1.5 mb-1.5 text-xs text-accentPurple font-medium">
                            <Download className="w-3.5 h-3.5" />
                            <span>{progressMap[server.id]!.label}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                            {progressMap[server.id]!.percent !== null ? (
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-accentPurple to-blue-500 transition-all duration-500"
                                style={{ width: `${progressMap[server.id]!.percent}%` }}
                              ></div>
                            ) : (
                              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-accentPurple to-blue-500 animate-pulse"></div>
                            )}
                          </div>
                        </div>
                      )}

```

(The `Download` icon is already imported at the top of the file; no import change needed.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual UI verification**

Run the app (`npm run dev`), open the dashboard, and start a SteamCMD-backed game (e.g. Valheim) on a server that is not yet installed. Confirm:
- The card shows "Setting up SteamCMD…" with a pulsing (indeterminate) bar, then
- "Downloading Valheim NN%" with the bar filling as the percentage climbs, then
- The bar disappears when the server reaches `RUNNING`.

Repeat for a direct-download game (e.g. Minecraft) to confirm the HTTP path shows a percentage (or an indeterminate bar if no Content-Length).

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "$(printf 'feat: show live install/download progress bar on server card\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage:**
- In-memory store + globalThis pattern → Task 1. ✓
- Pure helpers `parseSteamProgress` / `computePercent` → Task 1. ✓
- SteamCMD setup/self-update/download labels → Task 2 (steps 4–6). ✓
- HTTP download percent + indeterminate fallback → Task 2 (steps 2, 7). ✓
- Archive extraction + custom-script labels → Task 2 (steps 7, 8). ✓
- `clearProgress` on spawn, exit/crash, update success/error → Task 2 (steps 9, 10, 13). ✓
- `UPDATING` flow → Task 2 (steps 11–13). ✓
- Endpoint with logs-route auth pattern, returns `{ status, progress }` → Task 3. ✓
- Card polling (~1.5s, only STARTING/UPDATING) + determinate/indeterminate bar → Task 4. ✓
- Unit tests for parser/percent/store → Task 1. ✓

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N" — all code is literal. ✓

**Type consistency:** `ProgressState` shape is identical across the store (Task 1), the frontend state type (Task 4 uses the structural subset `{ phase; percent; label }`), and the endpoint payload (Task 3). `setProgress` partial-merge, `parseSteamProgress`/`computePercent` signatures, `installSteamCmdApp` `onProgress: (p:{percent,label})` vs `downloadFile` `onProgress: (percent)` are used consistently by their Task 2 callers. ✓
