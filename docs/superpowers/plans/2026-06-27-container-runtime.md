# Container Runtime (DockerRunner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `DockerRunner` a real, selectable, full-lifecycle runtime alongside `LocalWindowsRunner`, driven by a data-driven `container` spec block and a per-server runtime toggle, starting with Valheim end-to-end.

**Architecture:** A second implementation of the existing `ServerRunner` interface that shells out to the Docker CLI through one connection wrapper (the remote-host seam). It reuses the existing definition engine (`planConfigFiles`, `planPorts`, a new `planContainer`), the shared per-server `server.log` file (so the existing log-tailer SSE and `getStats`-driven monitor work unchanged), and the existing `crashPolicy` for auto-restart. A host directory is bind-mounted into the container so existing config writers work as-is.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Node `child_process` (`execFile`/`spawn`), Prisma, Vitest. Docker CLI (`docker`) on the host. Generic SteamCMD base image `cm2network/steamcmd`.

## Global Constraints

- **No database migration.** The `container` block lives inside the JSON `spec` column (parsed by `parseSpec`). `runnerType` is already a `String` column (default `"CLOUD"`); persisting `"DOCKER"` needs no migration.
- **Docker offered only when a definition declares a `container` block** AND the daemon is available. Games without a native Linux dedicated server stay local-only.
- **Default base image:** `cm2network/steamcmd` (overridable per-definition via `container.image`).
- **Reuse, don't duplicate:** write container console output into the same per-server `server.log` used by the local runner; implement `getStats` so the existing `processMonitor` lights up live SSE stats with no monitor changes.
- **Container naming/paths:** container name `realmswap-server-<serverId>`; host data dir `<dataRoot>/local-servers/<serverId>` bind-mounted to `/data`.
- **Every Docker invocation routes through the `docker()` / `dockerSpawn()` wrapper** so `DOCKER_HOST`/context selection is a single seam.
- Path alias: import app/lib code with `@/lib/...`; files under `src/lib/**` use relative imports (`./db`, `../appPaths`), matching the existing runners.
- Run the test suite with `npx vitest run`. Run a single file with `npx vitest run <path>`.

---

### Task 1: `container` spec block + `planContainer`

**Files:**
- Modify: `src/lib/definitions/types.ts`
- Modify: `src/lib/definitions/plan.ts`
- Test: `src/lib/definitions/__tests__/planContainer.test.ts` (create)

**Interfaces:**
- Consumes: `GameDefinitionSpec`, `DefinitionContext`, `ArgSpec`, `renderArgs`, `renderTemplate` (existing).
- Produces:
  - `ContainerSpec` interface and optional `container?: ContainerSpec` on `GameDefinitionSpec`.
  - `interface ContainerPlan { image: string; installSubDir: string; executable: string; args: string[]; env?: Record<string,string>; }`
  - `const DEFAULT_STEAMCMD_IMAGE = "cm2network/steamcmd"`
  - `planContainer(spec: GameDefinitionSpec, ctx: DefinitionContext): ContainerPlan | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/definitions/__tests__/planContainer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildContext } from "../context";
import { planContainer, DEFAULT_STEAMCMD_IMAGE } from "../plan";
import type { GameDefinitionSpec } from "../types";

function specWith(container: any): GameDefinitionSpec {
  return {
    install: { appId: "896660", installSubDir: "valheim-server", checkFile: "x", requiredDiskGB: 2.5 },
    launch: { executable: "x", args: [] },
    defaultPort: 2456,
    params: [],
    configFiles: [],
    ports: [],
    container,
  } as unknown as GameDefinitionSpec;
}

function ctx(spec: GameDefinitionSpec) {
  return buildContext({ name: "My Realm", password: null, port: 2456, ram: 6, paramValuesJson: null, spec });
}

describe("planContainer", () => {
  it("returns null when no container block is present", () => {
    const spec = specWith(undefined);
    expect(planContainer(spec, ctx(spec))).toBeNull();
  });

  it("resolves executable, rendered args, env, and defaults image + installSubDir", () => {
    const spec = specWith({
      executable: "valheim_server.x86_64",
      env: { SteamAppId: "892970" },
      args: ["-name", "{name}", "-port", "2456"],
    });
    expect(planContainer(spec, ctx(spec))).toEqual({
      image: DEFAULT_STEAMCMD_IMAGE,
      installSubDir: "valheim-server",
      executable: "valheim_server.x86_64",
      args: ["-name", "My Realm", "-port", "2456"],
      env: { SteamAppId: "892970" },
    });
  });

  it("honors image override and explicit installSubDir, applies includeWhen filtering", () => {
    const spec = specWith({
      image: "ghcr.io/example/custom",
      installSubDir: "custom-dir",
      args: ["always", { value: ["-pw", "{password}"], includeWhen: "password" }],
    });
    const p = planContainer(spec, ctx(spec))!;
    expect(p.image).toBe("ghcr.io/example/custom");
    expect(p.installSubDir).toBe("custom-dir");
    expect(p.args).toEqual(["always"]); // password empty -> omitted
    expect(p.env).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/definitions/__tests__/planContainer.test.ts`
Expected: FAIL — `planContainer` / `DEFAULT_STEAMCMD_IMAGE` not exported.

- [ ] **Step 3: Add the types**

In `src/lib/definitions/types.ts`, add the `ContainerSpec` interface immediately above `GameDefinitionSpec`:

```ts
export interface ContainerSpec {
  image?: string;                 // default: DEFAULT_STEAMCMD_IMAGE
  executable: string;             // Linux server binary, e.g. "valheim_server.x86_64"
  args?: ArgSpec[];               // reuses ArgSpec (string | { value, includeWhen })
  env?: Record<string, string>;   // extra env vars set inside the container
  installSubDir?: string;         // defaults to the steamcmd install.installSubDir
}
```

Then add the optional field to `GameDefinitionSpec` (after `queryPort?: string;`):

```ts
  container?: ContainerSpec;
```

- [ ] **Step 4: Implement `planContainer`**

In `src/lib/definitions/plan.ts`, add to the imports from `./types` the `GameDefinitionSpec` is already imported. Append at the end of the file:

```ts
export const DEFAULT_STEAMCMD_IMAGE = "cm2network/steamcmd";

export interface ContainerPlan {
  image: string;
  installSubDir: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
}

export function planContainer(spec: GameDefinitionSpec, ctx: DefinitionContext): ContainerPlan | null {
  const c = spec.container;
  if (!c) return null;
  const installSubDir = c.installSubDir ?? (spec.install as any).installSubDir ?? "";
  const env = c.env
    ? Object.fromEntries(Object.entries(c.env).map(([k, v]) => [k, renderTemplate(v, ctx)]))
    : undefined;
  return {
    image: c.image ?? DEFAULT_STEAMCMD_IMAGE,
    installSubDir,
    executable: c.executable,
    args: renderArgs(c.args ?? [], ctx),
    env,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/definitions/__tests__/planContainer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/definitions/types.ts src/lib/definitions/plan.ts src/lib/definitions/__tests__/planContainer.test.ts
git commit -m "feat(definitions): add container spec block and planContainer"
```

---

### Task 2: Seed Valheim `container` block + regenerate snapshot

**Files:**
- Modify: `src/lib/definitions/builtins.ts`
- Modify (generated): `src/lib/definitions/builtins.generated.json`
- Test: `src/lib/definitions/__tests__/parity.test.ts`

**Interfaces:**
- Consumes: `BUILTIN_DEFINITIONS`, `planContainer`, `buildContext` (from Task 1).
- Produces: a `container` block on the `VALHEIM` built-in. `prisma/seed.js` reads `builtins.generated.json`, so it MUST be regenerated.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/definitions/__tests__/parity.test.ts`:

```ts
import { planContainer } from "../plan";

describe("container: Valheim", () => {
  it("produces a Linux container plan with rendered args and env", () => {
    const c = ctxFor("VALHEIM", { name: "Viking Realm", password: "abc", ram: 6 }); // short pw -> viking123
    const p = planContainer(def("VALHEIM").spec, c)!;
    expect(p).not.toBeNull();
    expect(p.image).toBe("cm2network/steamcmd");
    expect(p.installSubDir).toBe("valheim-server");
    expect(p.executable).toBe("valheim_server.x86_64");
    expect(p.env).toEqual({ LD_LIBRARY_PATH: "./linux64", SteamAppId: "892970" });
    expect(p.args).toEqual([
      "-nographics", "-batchmode", "-name", "Viking Realm", "-port", "2456",
      "-world", "Dedicated", "-password", "viking123", "-public", "1", "-crossplay",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/definitions/__tests__/parity.test.ts`
Expected: FAIL — `planContainer(...)` returns `null` (no container block yet).

- [ ] **Step 3: Add the Valheim `container` block**

In `src/lib/definitions/builtins.ts`, in the `VALHEIM` entry's `spec`, add a `container` block. Insert it right after the `launch: { ... },` block and before `defaultPort: 2456`:

```ts
      container: {
        executable: "valheim_server.x86_64",
        installSubDir: "valheim-server",
        env: { LD_LIBRARY_PATH: "./linux64", SteamAppId: "892970" },
        args: ["-nographics", "-batchmode", "-name", "{name}", "-port", "2456", "-world", "Dedicated", "-password", "{password}", "-public", "1", "-crossplay"],
      },
```

- [ ] **Step 4: Regenerate the snapshot consumed by the seeder**

Run (from the worktree root):

```bash
npx tsx -e "import {BUILTIN_DEFINITIONS} from './src/lib/definitions/builtins'; import fs from 'fs'; fs.writeFileSync('./src/lib/definitions/builtins.generated.json', JSON.stringify(BUILTIN_DEFINITIONS, null, 2));"
```

Expected: no output; `git status` shows `builtins.generated.json` modified with the new `container` block under Valheim.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/definitions/__tests__/parity.test.ts`
Expected: PASS (existing parity tests + the new Valheim container test).

- [ ] **Step 6: Commit**

```bash
git add src/lib/definitions/builtins.ts src/lib/definitions/builtins.generated.json src/lib/definitions/__tests__/parity.test.ts
git commit -m "feat(definitions): seed Valheim Linux container block"
```

---

### Task 3: Docker CLI pure helpers

**Files:**
- Create: `src/lib/runners/docker/dockerCli.ts`
- Test: `src/lib/runners/docker/__tests__/dockerCli.test.ts` (create)

**Interfaces:**
- Consumes: `PortPlan` (from `@/lib/definitions/plan` — use relative `../../definitions/plan`), `ProcessStats` (from `../types`).
- Produces (pure, no I/O):
  - `shellQuote(s: string): string`
  - `parseMemToMB(token: string): number`
  - `parseDockerStats(output: string): ProcessStats`
  - `buildStartEntrypoint(appId: string, installSubDir: string, executable: string, args: string[]): string`
  - `interface DockerRunOptions { containerName: string; image: string; hostDataDir: string; ports: PortPlan[]; entrypoint: string; env?: Record<string,string>; }`
  - `buildRunArgs(o: DockerRunOptions): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/runners/docker/__tests__/dockerCli.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  shellQuote, parseMemToMB, parseDockerStats, buildStartEntrypoint, buildRunArgs,
} from "../dockerCli";

describe("shellQuote", () => {
  it("leaves safe tokens unquoted", () => {
    expect(shellQuote("-port")).toBe("-port");
    expect(shellQuote("2456")).toBe("2456");
  });
  it("single-quotes tokens with spaces", () => {
    expect(shellQuote("Viking Realm")).toBe("'Viking Realm'");
  });
  it("escapes embedded single quotes", () => {
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
});

describe("parseMemToMB", () => {
  it("parses MiB/GiB/KiB", () => {
    expect(parseMemToMB("123MiB")).toBeCloseTo(123, 3);
    expect(parseMemToMB("2GiB")).toBeCloseTo(2048, 3);
    expect(parseMemToMB("512KiB")).toBeCloseTo(0.5, 3);
    expect(parseMemToMB("1.5GiB")).toBeCloseTo(1536, 3);
  });
  it("returns 0 for junk", () => {
    expect(parseMemToMB("")).toBe(0);
  });
});

describe("parseDockerStats", () => {
  it("parses cpu percent and used memory", () => {
    const s = parseDockerStats("0.15%,123MiB / 2GiB");
    expect(s.cpuPercent).toBeCloseTo(0.15, 3);
    expect(s.memoryMB).toBeCloseTo(123, 3);
  });
  it("returns zeros for empty output", () => {
    expect(parseDockerStats("")).toEqual({ cpuPercent: 0, memoryMB: 0 });
  });
});

describe("buildStartEntrypoint", () => {
  it("runs steamcmd app_update then execs the server binary with quoted args", () => {
    const ep = buildStartEntrypoint("896660", "valheim-server", "valheim_server.x86_64", ["-name", "Viking Realm", "-port", "2456"]);
    expect(ep).toBe(
      "steamcmd +force_install_dir /data/valheim-server +login anonymous +app_update 896660 validate +quit" +
      " && cd /data/valheim-server && exec ./valheim_server.x86_64 -name 'Viking Realm' -port 2456"
    );
  });
});

describe("buildRunArgs", () => {
  it("builds docker run argv with mounts, published ports, env, and entrypoint", () => {
    const args = buildRunArgs({
      containerName: "realmswap-server-abc",
      image: "cm2network/steamcmd",
      hostDataDir: "/data/local-servers/abc",
      ports: [{ protocol: "UDP", port: 2456 }, { protocol: "UDP", port: 2457 }],
      env: { SteamAppId: "892970" },
      entrypoint: "echo hi",
    });
    expect(args).toEqual([
      "run", "-d", "--name", "realmswap-server-abc",
      "-v", "/data/local-servers/abc:/data",
      "-p", "2456:2456/udp",
      "-p", "2457:2457/udp",
      "-e", "SteamAppId=892970",
      "cm2network/steamcmd", "bash", "-lc", "echo hi",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runners/docker/__tests__/dockerCli.test.ts`
Expected: FAIL — module `../dockerCli` not found.

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/runners/docker/dockerCli.ts`:

```ts
import type { PortPlan } from "../../definitions/plan";
import type { ProcessStats } from "../types";

/** Quote a single shell token for a `bash -lc` command line. Safe tokens
 *  (letters, digits, and a small set of punctuation) are returned as-is. */
export function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Convert a Docker memory token (e.g. "123MiB", "2GiB") to megabytes. */
export function parseMemToMB(token: string): number {
  const m = token.trim().match(/^([\d.]+)\s*([KMGT]?i?B)?$/i);
  if (!m) return 0;
  const value = parseFloat(m[1]);
  if (isNaN(value)) return 0;
  const unit = (m[2] || "MiB").toLowerCase();
  if (unit.startsWith("k")) return value / 1024;
  if (unit.startsWith("g")) return value * 1024;
  if (unit.startsWith("t")) return value * 1024 * 1024;
  if (unit === "b") return value / (1024 * 1024);
  return value; // MiB / MB
}

/** Parse `docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}}"`. */
export function parseDockerStats(output: string): ProcessStats {
  const trimmed = output.trim();
  if (!trimmed) return { cpuPercent: 0, memoryMB: 0 };
  const [cpuStr = "", memPart = ""] = trimmed.split(",");
  const cpuPercent = parseFloat(cpuStr.replace("%", "")) || 0;
  const memUsed = memPart.split("/")[0]?.trim() ?? "";
  return { cpuPercent, memoryMB: parseMemToMB(memUsed) };
}

/** Shell command run as the container entrypoint: SteamCMD install/validate,
 *  then exec the server binary from the install dir. */
export function buildStartEntrypoint(
  appId: string,
  installSubDir: string,
  executable: string,
  args: string[],
): string {
  const quoted = args.map(shellQuote).join(" ");
  const execLine = quoted ? `exec ./${executable} ${quoted}` : `exec ./${executable}`;
  return (
    `steamcmd +force_install_dir /data/${installSubDir} +login anonymous` +
    ` +app_update ${appId} validate +quit` +
    ` && cd /data/${installSubDir} && ${execLine}`
  );
}

export interface DockerRunOptions {
  containerName: string;
  image: string;
  hostDataDir: string;
  ports: PortPlan[];
  entrypoint: string;
  env?: Record<string, string>;
}

/** Build the argv for `docker run -d ...` (consumed by execFile, no shell). */
export function buildRunArgs(o: DockerRunOptions): string[] {
  const args = ["run", "-d", "--name", o.containerName, "-v", `${o.hostDataDir}:/data`];
  for (const p of o.ports) {
    args.push("-p", `${p.port}:${p.port}/${p.protocol.toLowerCase()}`);
  }
  if (o.env) {
    for (const [k, v] of Object.entries(o.env)) args.push("-e", `${k}=${v}`);
  }
  args.push(o.image, "bash", "-lc", o.entrypoint);
  return args;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runners/docker/__tests__/dockerCli.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/lib/runners/docker/dockerCli.ts src/lib/runners/docker/__tests__/dockerCli.test.ts
git commit -m "feat(docker): pure docker CLI helpers (run args, entrypoint, stats parsing)"
```

---

### Task 4: Docker connection wrapper + availability + `docker-status` route

**Files:**
- Modify: `src/lib/runners/docker/dockerCli.ts`
- Create: `src/app/api/system/docker-status/route.ts`
- Test: `src/lib/runners/docker/__tests__/dockerCli.test.ts`

**Interfaces:**
- Consumes: Node `child_process` `execFile`/`spawn`.
- Produces:
  - `type DockerResult = { code: number | null; stdout: string; stderr: string }`
  - `docker(args: string[], opts?: { timeoutMs?: number }): Promise<DockerResult>`
  - `dockerSpawn(args: string[]): ChildProcessWithoutNullStreams`
  - `isDockerAvailable(run?: (args: string[]) => Promise<DockerResult>): Promise<boolean>` (injectable for tests; defaults to `docker`)
  - `GET /api/system/docker-status` → `{ available: boolean }`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/runners/docker/__tests__/dockerCli.test.ts`:

```ts
import { isDockerAvailable } from "../dockerCli";

describe("isDockerAvailable", () => {
  it("is true when `docker version` exits 0", async () => {
    const fake = async () => ({ code: 0, stdout: "27.0.3", stderr: "" });
    expect(await isDockerAvailable(fake)).toBe(true);
  });
  it("is false when the docker command errors", async () => {
    const fake = async () => ({ code: 1, stdout: "", stderr: "Cannot connect to the Docker daemon" });
    expect(await isDockerAvailable(fake)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runners/docker/__tests__/dockerCli.test.ts`
Expected: FAIL — `isDockerAvailable` not exported.

- [ ] **Step 3: Implement the wrapper + availability check**

Prepend the imports at the top of `src/lib/runners/docker/dockerCli.ts`:

```ts
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "child_process";
```

Append to the end of `src/lib/runners/docker/dockerCli.ts`:

```ts
export type DockerResult = { code: number | null; stdout: string; stderr: string };

/** Environment passed to every docker invocation. Passing process.env through
 *  means DOCKER_HOST / DOCKER_CONTEXT / DOCKER_TLS_VERIFY / DOCKER_CERT_PATH are
 *  honored — this is the single seam for targeting a remote daemon later. */
function dockerEnv(): NodeJS.ProcessEnv {
  return process.env;
}

/** Run `docker <args>` and resolve (never reject) with exit code and output. */
export function docker(args: string[], opts?: { timeoutMs?: number }): Promise<DockerResult> {
  return new Promise((resolve) => {
    execFile(
      "docker",
      args,
      { env: dockerEnv(), timeout: opts?.timeoutMs ?? 0, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err && typeof (err as any).code === "number" ? (err as any).code : err ? 1 : 0;
        resolve({ code, stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" });
      },
    );
  });
}

/** Spawn a long-lived `docker <args>` process (e.g. `logs -f`, `wait`). */
export function dockerSpawn(args: string[]): ChildProcessWithoutNullStreams {
  return spawn("docker", args, { env: dockerEnv(), windowsHide: true });
}

/** True when the Docker daemon is reachable. `run` is injectable for tests. */
export async function isDockerAvailable(
  run: (args: string[]) => Promise<DockerResult> = (a) => docker(a, { timeoutMs: 5000 }),
): Promise<boolean> {
  const { code } = await run(["version", "--format", "{{.Server.Version}}"]);
  return code === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runners/docker/__tests__/dockerCli.test.ts`
Expected: PASS (including the two new `isDockerAvailable` tests).

- [ ] **Step 5: Add the `docker-status` route**

Create `src/app/api/system/docker-status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { isDockerAvailable } from "@/lib/runners/docker/dockerCli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/system/docker-status -> { available: boolean }
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let available = false;
  try {
    available = await isDockerAvailable();
  } catch {
    available = false;
  }
  return NextResponse.json({ available });
}
```

- [ ] **Step 6: Verify build/typecheck of the route**

Run: `npx tsc --noEmit`
Expected: no errors referencing the new files. (Pre-existing unrelated errors, if any, are out of scope — note them but do not fix here.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/runners/docker/dockerCli.ts src/lib/runners/docker/__tests__/dockerCli.test.ts src/app/api/system/docker-status/route.ts
git commit -m "feat(docker): connection wrapper, availability check, and docker-status route"
```

---

### Task 5: Shared `server.log` module + refactor `LocalWindowsRunner`

**Files:**
- Create: `src/lib/serverLogs.ts`
- Modify: `src/lib/runners/LocalWindowsRunner.ts`
- Test: `src/lib/__tests__/serverLogs.test.ts` (create)

**Interfaces:**
- Consumes: `dataRoot` (`../appPaths`), Node `fs`/`path`.
- Produces:
  - `serverLogFile(serverId: string): string`
  - `appendLog(serverId: string, message: string): void`
  - `clearLogs(serverId: string): void`
  - `getServerLogTail(serverId: string, lines?: number): string` (default 150)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/serverLogs.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { appendLog, clearLogs, getServerLogTail, serverLogFile } from "../serverLogs";

describe("serverLogs", () => {
  const original = process.env.GAMEVAULT_DATA_DIR;
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-logs-"));
    process.env.GAMEVAULT_DATA_DIR = tmp;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GAMEVAULT_DATA_DIR;
    else process.env.GAMEVAULT_DATA_DIR = original;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("appends lines and reads them back as a tail", () => {
    clearLogs("s1");
    appendLog("s1", "line one");
    appendLog("s1", "line two\n");
    expect(getServerLogTail("s1")).toBe("line one\nline two\n");
  });

  it("clearLogs removes the file and tail reports no logs", () => {
    appendLog("s2", "hello");
    clearLogs("s2");
    expect(fs.existsSync(serverLogFile("s2"))).toBe(false);
    expect(getServerLogTail("s2")).toContain("No logs available");
  });

  it("getServerLogTail returns only the last N lines", () => {
    clearLogs("s3");
    for (let i = 0; i < 10; i++) appendLog("s3", `n${i}`);
    expect(getServerLogTail("s3", 3)).toBe("n7\nn8\nn9\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/serverLogs.test.ts`
Expected: FAIL — module `../serverLogs` not found.

- [ ] **Step 3: Implement the shared module**

Create `src/lib/serverLogs.ts` (logic lifted verbatim from `LocalWindowsRunner.ts`, plus a tail reader that matches `getLocalServerLogs`):

```ts
import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";

// Console output is appended to <dataRoot>/local-servers/<serverId>/server.log and
// streamed to the UI by the log-tailing SSE route. Persisting to disk means console
// history survives app restarts and is shared by every runner implementation.
export function serverLogFile(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId, "server.log");
}

export function appendLog(serverId: string, message: string): void {
  try {
    const file = serverLogFile(serverId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, message.replace(/\r?\n$/, "") + "\n");
  } catch {
    // best-effort logging; never let a log write crash the runner
  }
}

export function clearLogs(serverId: string): void {
  try {
    fs.rmSync(serverLogFile(serverId), { force: true });
  } catch {
    // ignore
  }
}

export function getServerLogTail(serverId: string, lines = 150): string {
  const file = serverLogFile(serverId);
  if (!fs.existsSync(file)) {
    return "No logs available. Start the server to generate logs.";
  }
  return fs.readFileSync(file, "utf-8").split("\n").slice(-lines).join("\n");
}
```

- [ ] **Step 4: Refactor `LocalWindowsRunner` to use the shared module**

In `src/lib/runners/LocalWindowsRunner.ts`:

1. Remove the local definitions of `serverLogFile`, `appendLog`, and `clearLogs` (the block spanning the `function serverLogFile...` through the end of `function clearLogs...`, lines ~24–42), and the comment above them.
2. Add an import near the other `../` imports:

```ts
import { appendLog, clearLogs, serverLogFile, getServerLogTail } from "../serverLogs";
```

3. Replace the body of `getLocalServerLogs` so it delegates:

```ts
export function getLocalServerLogs(serverId: string): string {
  return getServerLogTail(serverId);
}
```

(Leave all other call sites — `appendLog(...)`, `clearLogs(...)`, `serverLogFile(...)` — unchanged; they now resolve to the imported functions.)

- [ ] **Step 5: Run the full suite to verify nothing regressed**

Run: `npx vitest run`
Expected: PASS — all previously-passing tests still pass, plus the 3 new `serverLogs` tests. (`logTailer.test.ts` still passes because the file format/location is unchanged.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/serverLogs.ts src/lib/runners/LocalWindowsRunner.ts src/lib/__tests__/serverLogs.test.ts
git commit -m "refactor(runners): extract shared server.log helpers into serverLogs"
```

---

### Task 6: DockerRunner full lifecycle

**Files:**
- Rewrite: `src/lib/runners/DockerRunner.ts`

**Interfaces:**
- Consumes: `ServerRunner`, `ProcessStats` (`./types`); `docker`, `dockerSpawn`, `buildRunArgs`, `buildStartEntrypoint`, `parseDockerStats` (`./docker/dockerCli`); `planContainer`, `planConfigFiles`, `planPorts`, `planInstall` (`../definitions/plan`); `parseSpec` (`../definitions/serialize`); `buildContext` (`../definitions/context`); `writeStrategyConfig` (`../definitions/strategies`); `appendLog`, `clearLogs`, `getServerLogTail` (`../serverLogs`); `prisma` (`../db`); `serverEventBus` (`../eventBus`); `setProgress`, `clearProgress`, `parseSteamProgress` (`../downloadProgress`); `startMonitoring`, `stopMonitoring`, `clearStatsHistory` (`../processMonitor`); `isCrashExit`, `evaluateCrash`, `CRASH_MAX_RETRIES`, `CrashCounter` (`../crashPolicy`); `dataRoot` (`../appPaths`).
- Produces: `export class DockerRunner implements ServerRunner` with full lifecycle. No new exported helpers consumed by other tasks.

This is integration code orchestrating Docker + the database + SSE. It reuses the unit-tested pure helpers from Tasks 1, 3, 4 and is verified end-to-end manually (Step 4). There is no new unit test; correctness of the extracted pure pieces is already covered.

- [ ] **Step 1: Replace `DockerRunner.ts` wholesale**

Replace the entire contents of `src/lib/runners/DockerRunner.ts` with:

```ts
import path from "path";
import { Server, GameDefinition } from "@/generated/client";
import { ServerRunner, ProcessStats } from "./types";
import { docker, dockerSpawn, buildRunArgs, buildStartEntrypoint, parseDockerStats } from "./docker/dockerCli";
import { prisma } from "../db";
import { dataRoot } from "../appPaths";
import { parseSpec } from "../definitions/serialize";
import { buildContext } from "../definitions/context";
import { planContainer, planConfigFiles, planPorts, planInstall } from "../definitions/plan";
import { writeStrategyConfig } from "../definitions/strategies";
import { appendLog, clearLogs, getServerLogTail } from "../serverLogs";
import { serverEventBus } from "../eventBus";
import { setProgress, clearProgress, parseSteamProgress } from "../downloadProgress";
import { startMonitoring, stopMonitoring, clearStatsHistory } from "../processMonitor";
import { isCrashExit, evaluateCrash, CRASH_MAX_RETRIES, type CrashCounter } from "../crashPolicy";
import type { GameDefinitionSpec } from "../definitions/types";
import fs from "fs";

// Per-server helper processes (log follower + exit watcher), tracked on globalThis
// so they survive Next.js dev hot-reloads, mirroring localProcesses in the local runner.
const g = globalThis as unknown as {
  dockerFollowers: Map<string, import("child_process").ChildProcess> | undefined;
  dockerIntentionalStops: Set<string> | undefined;
  dockerCrashCounters: Map<string, CrashCounter> | undefined;
};
if (!g.dockerFollowers) g.dockerFollowers = new Map();
if (!g.dockerIntentionalStops) g.dockerIntentionalStops = new Set();
if (!g.dockerCrashCounters) g.dockerCrashCounters = new Map();
const followers = g.dockerFollowers;
const intentionalStops = g.dockerIntentionalStops;
const crashCounters = g.dockerCrashCounters;

function containerName(serverId: string): string {
  return `realmswap-server-${serverId}`;
}
function hostDataDir(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId);
}

async function resolveDefinition(server: { definitionId: string | null; game: string }):
  Promise<{ spec: GameDefinitionSpec; installMethod: string }> {
  const record = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  if (!record) throw new Error(`No game definition found for server (game=${server.game}).`);
  return { spec: parseSpec(record.spec), installMethod: record.installMethod };
}

function setStatus(serverId: string, status: string, extra: Record<string, unknown> = {}) {
  return prisma.server
    .update({ where: { id: serverId }, data: { status, ...extra } })
    .then(() => serverEventBus.emit("status_update", { serverId, status }))
    .catch(() => {});
}

export class DockerRunner implements ServerRunner {
  async install(): Promise<void> {
    // Install is implicit: the container entrypoint runs `steamcmd +app_update`
    // on every start (see buildStartEntrypoint). Nothing to do here.
  }

  async start(server: Server): Promise<void> {
    const serverId = server.id;
    if (followers.has(serverId)) return; // already running under this process

    const record = await prisma.server.findUnique({ where: { id: serverId } });
    if (!record) throw new Error("Server record not found in database.");

    const { spec, installMethod } = await resolveDefinition(record);
    if (installMethod !== "STEAMCMD") {
      throw new Error("Docker runner currently supports SteamCMD games only.");
    }
    const ctx = buildContext({
      name: record.name, password: record.password, port: record.port,
      ram: record.ramAllocation, paramValuesJson: record.paramValues, spec,
    });

    const container = planContainer(spec, ctx);
    if (!container) {
      throw new Error(`${record.game} has no container definition; it can only run with the Local runner.`);
    }
    const installPlan = planInstall(spec, "STEAMCMD");
    const ports = planPorts(spec, ctx);

    clearLogs(serverId);
    await setStatus(serverId, "STARTING", { pid: null, cpuUsage: 0, memoryUsage: 0 });
    setProgress(serverId, { phase: "steam", percent: null, label: "Preparing container…" });

    // Write config files onto the host bind-mount path (reuses existing writers).
    const baseDir = hostDataDir(serverId);
    const installDir = container.installSubDir ? path.join(baseDir, container.installSubDir) : baseDir;
    fs.mkdirSync(installDir, { recursive: true });
    for (const cf of planConfigFiles(spec, ctx)) {
      const full = path.join(installDir, cf.relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (cf.strategy === "template") {
        fs.writeFileSync(full, cf.content ?? "");
      } else {
        writeStrategyConfig({
          strategy: cf.strategy as "enshroudedJson" | "zomboidIniMerge",
          installDir, serverName: record.name, password: record.password || undefined,
        });
      }
    }

    // Remove any stale container so start is idempotent.
    await docker(["rm", "-f", containerName(serverId)]);

    const entrypoint = buildStartEntrypoint(
      installPlan.appId!, container.installSubDir, container.executable, container.args,
    );
    const runArgs = buildRunArgs({
      containerName: containerName(serverId),
      image: container.image,
      hostDataDir: baseDir,
      ports,
      env: container.env,
      entrypoint,
    });

    const res = await docker(runArgs);
    if (res.code !== 0) {
      clearProgress(serverId);
      appendLog(serverId, `[Docker] Failed to start container: ${res.stderr || res.stdout}`);
      await setStatus(serverId, "STOPPED", { pid: null });
      throw new Error(`Failed to start Docker container: ${res.stderr || res.stdout || "unknown error"}`);
    }

    appendLog(serverId, `[Docker] Container ${containerName(serverId)} started. Pulling/validating game files via SteamCMD…`);
    this.attachFollower(serverId, spec);
    this.attachExitWatcher(serverId, record.game, record.ramAllocation);
    startMonitoring(record);
  }

  // Follow container stdout: persist to server.log, drive the download-progress
  // bar (SteamCMD output), and detect readiness via the spec's readyPattern.
  private attachFollower(serverId: string, spec: GameDefinitionSpec) {
    const follower = dockerSpawn(["logs", "-f", "--tail", "0", containerName(serverId)]);
    followers.set(serverId, follower);

    const readyPattern = spec.launch.readyPattern ? new RegExp(spec.launch.readyPattern, "i") : null;
    let ready = false;
    const markReady = (reason: string) => {
      if (ready) return;
      ready = true;
      clearProgress(serverId);
      appendLog(serverId, `[Readiness Check] Server is ready (${reason})`);
      setStatus(serverId, "RUNNING");
    };

    const onChunk = (buf: Buffer) => {
      const s = buf.toString();
      appendLog(serverId, s);
      const pct = parseSteamProgress(s.replace(/[\r\n]+/g, " "));
      if (pct !== null && !ready) {
        setProgress(serverId, { phase: "steam", percent: pct, label: `Downloading ${Math.round(pct)}%` });
      }
      if (readyPattern && readyPattern.test(s)) markReady(`Matched log pattern: ${spec.launch.readyPattern}`);
    };
    follower.stdout?.on("data", onChunk);
    follower.stderr?.on("data", onChunk);

    // Fallback: mark ready after 5 minutes even without a pattern match.
    const timeout = setTimeout(() => markReady("5-minute fallback timeout reached"), 5 * 60 * 1000);
    follower.on("close", () => clearTimeout(timeout));
  }

  // Watch for container exit and route it through the shared crash policy.
  private attachExitWatcher(serverId: string, game: string, ram: number) {
    const waiter = dockerSpawn(["wait", containerName(serverId)]);
    let out = "";
    waiter.stdout?.on("data", (b) => (out += b.toString()));
    waiter.on("close", () => {
      const exitCode = parseInt(out.trim(), 10);
      this.handleContainerExit(serverId, isNaN(exitCode) ? null : exitCode, game, ram);
    });
  }

  private async handleContainerExit(serverId: string, code: number | null, game: string, ram: number) {
    const follower = followers.get(serverId);
    if (follower) { try { follower.kill(); } catch { /* ignore */ } }
    followers.delete(serverId);
    stopMonitoring(serverId);
    clearProgress(serverId);

    const wasIntentional = intentionalStops.has(serverId);
    intentionalStops.delete(serverId);
    const isCrash = isCrashExit(wasIntentional, code);

    const rec = await prisma.server.findUnique({ where: { id: serverId } }).catch(() => null);
    if (!rec) return;

    if (isCrash) {
      const { counter, shouldRestart } = evaluateCrash(crashCounters.get(serverId), Date.now());
      crashCounters.set(serverId, counter);
      appendLog(serverId, `[Crash Detection] Container exited with code ${code} (Attempt ${counter.count}/${CRASH_MAX_RETRIES})`);
      if (shouldRestart) {
        appendLog(serverId, "[Crash Detection] Auto-restarting in 5 seconds...");
        await setStatus(serverId, "STARTING", { pid: null, cpuUsage: 0, memoryUsage: 0 });
        setTimeout(async () => {
          try {
            clearStatsHistory(serverId);
            const fresh = await prisma.server.findUnique({ where: { id: serverId } });
            if (fresh) await this.start(fresh);
          } catch (e: any) {
            appendLog(serverId, `[Crash Detection] Auto-restart failed: ${e.message}`);
            await setStatus(serverId, "CRASHED", { pid: null });
          }
        }, 5000);
        return;
      }
      appendLog(serverId, `[Crash Detection] Max retries (${CRASH_MAX_RETRIES}) exhausted. Marking server as CRASHED.`);
      await setStatus(serverId, "CRASHED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
      return;
    }

    await setStatus(serverId, "STOPPED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
    appendLog(serverId, `Container exited with code ${code}.`);
  }

  async stop(server: Server): Promise<void> {
    const serverId = server.id;
    intentionalStops.add(serverId);
    crashCounters.delete(serverId);

    // Best-effort graceful in-game shutdown if the spec defines a stdin command.
    try {
      const { spec } = await resolveDefinition(server);
      const stopCmd = spec.launch.stdinStopCommand;
      if (stopCmd) await this.sendCommand(server, stopCmd.replace(/\n$/, ""));
    } catch { /* fall through to docker stop */ }

    const res = await docker(["stop", containerName(serverId)]);
    if (res.code !== 0 && !/no such container/i.test(res.stderr)) {
      throw new Error(`Failed to stop Docker container: ${res.stderr || res.stdout}`);
    }
    // The exit watcher updates status/DB on container exit. If the container was
    // already gone, ensure the DB reflects STOPPED.
    if (!followers.has(serverId)) {
      await setStatus(serverId, "STOPPED", { pid: null, ipAddress: "127.0.0.1", cpuUsage: 0, memoryUsage: 0 });
    }
  }

  async update(server: Server): Promise<void> {
    const serverId = server.id;
    const record = await prisma.server.findUnique({ where: { id: serverId } });
    if (!record) throw new Error("Server not found");
    const { spec, installMethod } = await resolveDefinition(record);
    if (installMethod !== "STEAMCMD") throw new Error("Updates are only supported for SteamCMD games.");
    const ctx = buildContext({
      name: record.name, password: record.password, port: record.port,
      ram: record.ramAllocation, paramValuesJson: record.paramValues, spec,
    });
    const container = planContainer(spec, ctx);
    const installPlan = planInstall(spec, "STEAMCMD");
    if (!container) throw new Error("No container definition for this game.");

    await setStatus(serverId, "UPDATING");
    appendLog(serverId, `[Update] Running SteamCMD app_update for ${record.game}…`);
    const cmd =
      `steamcmd +force_install_dir /data/${container.installSubDir} +login anonymous` +
      ` +app_update ${installPlan.appId} validate +quit`;
    const res = await docker([
      "run", "--rm",
      "-v", `${hostDataDir(serverId)}:/data`,
      container.image, "bash", "-lc", cmd,
    ]);
    if (res.code !== 0) {
      await setStatus(serverId, "STOPPED");
      throw new Error(`SteamCMD update failed: ${res.stderr || res.stdout}`);
    }
    appendLog(serverId, "[Update] Update completed successfully.");
    await setStatus(serverId, "STOPPED");
  }

  async sendCommand(server: Server, command: string): Promise<void> {
    // Best-effort: deliver to the server process (PID 1) stdin inside the container,
    // mirroring the local runner's child.stdin.write. Per-game consoles vary (RCON, etc.).
    const res = await docker([
      "exec", containerName(server.id), "bash", "-lc", `printf '%s\\n' "$CMD" > /proc/1/fd/0`,
    ].map((a) => a)); // CMD passed via env below
    if (res.code !== 0) {
      // Retry with the command embedded directly (no env), still best-effort.
      const r2 = await docker(["exec", containerName(server.id), "bash", "-lc", `printf '%s\\n' ${JSON.stringify(command)} > /proc/1/fd/0`]);
      if (r2.code !== 0) throw new Error(`Failed to send command to container: ${r2.stderr || r2.stdout}`);
    }
  }

  async getStats(server: Server): Promise<ProcessStats> {
    const res = await docker(
      ["stats", containerName(server.id), "--no-stream", "--format", "{{.CPUPerc}},{{.MemUsage}}"],
      { timeoutMs: 8000 },
    );
    if (res.code !== 0 || !res.stdout.trim()) return { cpuPercent: 0, memoryMB: 0 };
    return parseDockerStats(res.stdout);
  }

  async getLogs(server: Server): Promise<string> {
    return getServerLogTail(server.id);
  }
}
```

Note on `sendCommand`: the first `docker exec` references `$CMD` which is not set, so it is expected to be a no-op fallthrough to the second form that embeds the command via `JSON.stringify`. Simplify to a single call if preferred — keep the second (working) form:

```ts
  async sendCommand(server: Server, command: string): Promise<void> {
    const res = await docker([
      "exec", containerName(server.id), "bash", "-lc",
      `printf '%s\\n' ${JSON.stringify(command)} > /proc/1/fd/0`,
    ]);
    if (res.code !== 0) throw new Error(`Failed to send command to container: ${res.stderr || res.stdout}`);
  }
```

Use this single-call version (delete the two-call version above) — it is the intended implementation.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `DockerRunner.ts`. Fix any signature mismatches against the interfaces listed above.

- [ ] **Step 3: Run the full unit suite (no regressions)**

Run: `npx vitest run`
Expected: PASS — unchanged from Task 5 (DockerRunner has no unit tests; it must not break existing ones).

- [ ] **Step 4: Manual end-to-end verification (Valheim)**

Prerequisites: Docker Desktop running with file sharing enabled for the data drive.

1. Start the dev app per the project's normal dev flow (e.g. `npm run electron:dev`).
2. Create a Valheim server (the UI toggle lands in Task 9; until then, temporarily set the new server's `runnerType` to `"DOCKER"` directly in the DB, or proceed after Task 9).
3. Click Start. Observe in the console modal: SteamCMD download progress, then the Valheim boot log, then status transitions `STARTING → RUNNING` when `Game server connected` appears.
4. Confirm live CPU/memory stats update on the dashboard (proves `getStats` + monitor).
5. Click Stop; confirm the container stops (`docker ps` shows it gone) and status returns to `STOPPED`.
6. `docker logs realmswap-server-<id>` and the in-app console should match.

Record the outcome in the commit message. If env tweaks are needed (e.g. additional Valheim libs), adjust the `container.env`/image in `builtins.ts` and re-run Task 2 Step 4 (regenerate snapshot).

- [ ] **Step 5: Commit**

```bash
git add src/lib/runners/DockerRunner.ts
git commit -m "feat(runners): full-lifecycle DockerRunner (start/stop/update/console/stats/logs + crash restart)"
```

---

### Task 7: Stream container logs over SSE

**Files:**
- Modify: `src/app/api/servers/[id]/logs/stream/route.ts`

**Interfaces:**
- Consumes: `streamServerLog` (existing), `server.runnerType`.
- Produces: live log streaming for `DOCKER` servers (same file-tailer path as `LOCAL`).

- [ ] **Step 1: Broaden the runtime check to include DOCKER**

In `src/app/api/servers/[id]/logs/stream/route.ts`, change the condition from `LOCAL`-only to "has a local log file" by treating `DOCKER` like `LOCAL`:

```ts
      if (server.runnerType === "LOCAL" || server.runnerType === "DOCKER") {
```

(The `else` branch comment still applies to cloud/other runners. No other change — both runners write the same `server.log` consumed by `streamServerLog`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

With a running Docker server (Task 6 Step 4 still applicable), open the console modal and confirm log lines stream live (not just the one-time cloud notice).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/servers/[id]/logs/stream/route.ts
git commit -m "feat(logs): stream container console over SSE for DOCKER runner"
```

---

### Task 8: Persist chosen `runnerType` on server creation

**Files:**
- Create: `src/lib/runners/resolveRunnerType.ts`
- Modify: `src/app/api/servers/route.ts`
- Test: `src/lib/runners/__tests__/resolveRunnerType.test.ts` (create)

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `resolveRunnerType(requested: string | undefined, opts: { hasContainer: boolean; dockerAvailable: boolean }): "LOCAL" | "DOCKER"`

- [ ] **Step 1: Write the failing test**

Create `src/lib/runners/__tests__/resolveRunnerType.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveRunnerType } from "../resolveRunnerType";

describe("resolveRunnerType", () => {
  it("defaults to LOCAL when nothing requested", () => {
    expect(resolveRunnerType(undefined, { hasContainer: true, dockerAvailable: true })).toBe("LOCAL");
    expect(resolveRunnerType("LOCAL", { hasContainer: true, dockerAvailable: true })).toBe("LOCAL");
  });
  it("returns DOCKER only when requested, supported, and available", () => {
    expect(resolveRunnerType("DOCKER", { hasContainer: true, dockerAvailable: true })).toBe("DOCKER");
  });
  it("falls back to LOCAL when DOCKER requested but unsupported or unavailable", () => {
    expect(resolveRunnerType("DOCKER", { hasContainer: false, dockerAvailable: true })).toBe("LOCAL");
    expect(resolveRunnerType("DOCKER", { hasContainer: true, dockerAvailable: false })).toBe("LOCAL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/runners/__tests__/resolveRunnerType.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `src/lib/runners/resolveRunnerType.ts`:

```ts
export type RunnerType = "LOCAL" | "DOCKER";

/** Decide the runner to persist. DOCKER requires an explicit request, a container
 *  definition for the game, and a reachable daemon; otherwise we fall back to LOCAL. */
export function resolveRunnerType(
  requested: string | undefined,
  opts: { hasContainer: boolean; dockerAvailable: boolean },
): RunnerType {
  if (requested === "DOCKER" && opts.hasContainer && opts.dockerAvailable) return "DOCKER";
  return "LOCAL";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/runners/__tests__/resolveRunnerType.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the resolver into the create route**

In `src/app/api/servers/route.ts`:

1. Add imports near the top:

```ts
import { resolveRunnerType } from "@/lib/runners/resolveRunnerType";
import { isDockerAvailable } from "@/lib/runners/docker/dockerCli";
```

2. Read `runnerType` from the request body. Change the destructuring line:

```ts
    const { name, definitionId, ramAllocation, password, enableUpnp, paramValues, runnerType: requestedRunner } = await req.json();
```

3. Replace the hardcoded `const runnerType = "LOCAL";` (around line 133) with the resolved value. Insert before the `prisma.server.create` call:

```ts
    const hasContainer = !!spec.container;
    const dockerAvailable = requestedRunner === "DOCKER" ? await isDockerAvailable() : false;
    const runnerType = resolveRunnerType(requestedRunner, { hasContainer, dockerAvailable });
    if (requestedRunner === "DOCKER" && runnerType !== "DOCKER") {
      return NextResponse.json(
        { error: "Docker runtime is unavailable or unsupported for this game. Ensure Docker is running and the game supports containers." },
        { status: 400 },
      );
    }
```

(Leave `region`/`ipAddress` as-is. The `runnerType` field in `prisma.server.create` now references this resolved value.)

4. Update the activity-log detail line to reflect the runtime:

```ts
        details: `Deployed new ${runnerType === "DOCKER" ? "containerized" : "local"} ${def.slug} server '${name}' (${ramAllocation}GB RAM).`,
```

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS; no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/runners/resolveRunnerType.ts src/lib/runners/__tests__/resolveRunnerType.test.ts src/app/api/servers/route.ts
git commit -m "feat(servers): persist chosen runnerType (Docker vs Local) on creation"
```

---

### Task 9: Runtime toggle in `CreateServerView`

**Files:**
- Modify: `src/components/CreateServerView.tsx`

**Interfaces:**
- Consumes: `GET /api/system/docker-status`; the server-creation POST body (now accepts `runnerType`).
- Produces: a Runtime selector that sends `runnerType: "LOCAL" | "DOCKER"`.

This is UI wiring; verification is manual (no unit test). Follow the existing component's state/fetch conventions.

- [ ] **Step 1: Read the component to locate the state block, the selected definition, and the create POST**

Run: `npx vitest run` is not applicable. Open `src/components/CreateServerView.tsx` and find: (a) the `const runnerType = "LOCAL";` constant (~line 48), (b) where `selectedGame`/the selected definition's `spec` is available, and (c) the `fetch("/api/servers", { method: "POST", body: JSON.stringify({...}) })` call.

- [ ] **Step 2: Add Docker availability + runtime state**

Replace the `const runnerType = "LOCAL";` line with React state and an availability probe (place the `useEffect` next to the component's other effects):

```tsx
  const [runtime, setRuntime] = useState<"LOCAL" | "DOCKER">("LOCAL");
  const [dockerAvailable, setDockerAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system/docker-status")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => { if (!cancelled) setDockerAvailable(!!d.available); })
      .catch(() => { if (!cancelled) setDockerAvailable(false); });
    return () => { cancelled = true; };
  }, []);
```

(Ensure `useState`/`useEffect` are imported — they are already used in this component.)

- [ ] **Step 3: Determine container support for the selected game**

Where the selected definition's `spec` is in scope, compute whether Docker applies. Add (near where `installNotice`/`selectedGame` are derived):

```tsx
  const selectedHasContainer = !!selectedDefinition?.spec?.container; // use the component's existing selected-definition variable
  const dockerSelectable = dockerAvailable && selectedHasContainer;
```

If the component does not already hold the full selected definition object, use the same source it uses to read `spec` elsewhere (e.g. the catalog entry). The key expression is `spec?.container` being truthy.

- [ ] **Step 4: Render the Runtime selector**

Near the existing "Local Runner Notices" block (~line 585), add a runtime chooser. Match the surrounding styling/classes:

```tsx
        <div className="mt-4">
          <label className="block text-sm text-mutedText mb-2">Runtime</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRuntime("LOCAL")}
              className={`px-3 py-2 rounded-lg border text-sm ${runtime === "LOCAL" ? "border-accent text-accent" : "border-white/10 text-mutedText"}`}
            >
              Local PC
            </button>
            <button
              type="button"
              disabled={!dockerSelectable}
              onClick={() => dockerSelectable && setRuntime("DOCKER")}
              title={
                !dockerAvailable
                  ? "Docker daemon not detected"
                  : !selectedHasContainer
                  ? "This game does not support containers yet"
                  : "Run this server in a Docker container"
              }
              className={`px-3 py-2 rounded-lg border text-sm ${runtime === "DOCKER" ? "border-accent text-accent" : "border-white/10 text-mutedText"} ${!dockerSelectable ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              Docker
            </button>
          </div>
          {runtime === "DOCKER" && (
            <p className="text-xs text-mutedText mt-2">Runs in a Linux container via SteamCMD. Requires Docker Desktop running.</p>
          )}
        </div>
```

- [ ] **Step 5: Reset runtime when the selected game changes**

To avoid a stale `DOCKER` selection when switching to a game without a container block, force-reset in the same place the selected game changes (or add an effect):

```tsx
  useEffect(() => {
    if (!dockerSelectable && runtime === "DOCKER") setRuntime("LOCAL");
  }, [dockerSelectable, runtime]);
```

- [ ] **Step 6: Send `runnerType` in the create request**

In the `fetch("/api/servers", ...)` POST body, add `runnerType: runtime` to the JSON payload alongside the existing fields (`name`, `definitionId`, `ramAllocation`, `password`, `enableUpnp`, `paramValues`).

- [ ] **Step 7: Verify build + manual check**

Run: `npm run lint` (or `npx next lint`) and `npx tsc --noEmit`
Expected: no new errors.

Manual: launch the dev app. With Docker stopped, the Docker button is disabled. With Docker running and Valheim selected, the Docker button enables; selecting it and creating a server persists `runnerType="DOCKER"` (verify in DB / dashboard), and Start boots the container (Task 6 flow).

- [ ] **Step 8: Commit**

```bash
git add src/components/CreateServerView.tsx
git commit -m "feat(ui): per-server runtime toggle (Local PC vs Docker) in create flow"
```

---

### Task 10 (fast follow — only after Task 6 Valheim verification passes): seed remaining Linux built-ins

**Files:**
- Modify: `src/lib/definitions/builtins.ts`
- Modify (generated): `src/lib/definitions/builtins.generated.json`
- Test: `src/lib/definitions/__tests__/parity.test.ts`

**Interfaces:**
- Consumes: `planContainer` (Task 1).
- Produces: `container` blocks for Project Zomboid, Terraria, Palworld, Rust, and ARK.

Only proceed if Valheim ran end-to-end. Add one game at a time, regenerating the snapshot and verifying its `planContainer` output. Linux server details per game (executable / extra env):

- **Project Zomboid** (appId 380870): `executable: "start-server.sh"`, `installSubDir: "zomboid-server"`, args `["-cachedir=/data/zomboid-server/zomboid-data", "-servername", "servertest"]`.
- **Terraria** (appId 105600 for the dedicated Linux server differs from Steam appId 282440 — verify during implementation; if using SteamCMD app 282440 it ships `TerrariaServer.bin.x86_64`): `executable: "TerrariaServer.bin.x86_64"`, `installSubDir: "terraria-server"`, mirror the Windows args (`-port 7777 -players 8 [-pass {password}] -autocreate 1 -worldname {nameSanitized} -world worlds/{nameSanitized}.wld`), and keep `preLaunchDirs` handling by creating `worlds/` in the runner's config step (already created via `installDir` mkdir; add explicit `worlds` dir creation if Terraria needs it).
- **Palworld** (appId 2394010): `executable: "PalServer.sh"`, `installSubDir: "palworld-server"`, args as Windows minus `.exe` specifics.
- **Rust** (appId 258550): `executable: "RustDedicated"`, `installSubDir: "rust-server"`, env `{ LD_LIBRARY_PATH: "." }`, args mirror Windows.
- **ARK** (appId 376030): `executable: "ShooterGame/Binaries/Linux/ShooterGameServer"`, `installSubDir: "ark-server"`, args mirror Windows.

For EACH game:

- [ ] **Step A: Add a parity container test** (mirror the Valheim test from Task 2, asserting `image`, `installSubDir`, `executable`, and a representative `args` slice).
- [ ] **Step B:** Run it, watch it FAIL.
- [ ] **Step C:** Add the `container` block in `builtins.ts`.
- [ ] **Step D:** Regenerate the snapshot:

```bash
npx tsx -e "import {BUILTIN_DEFINITIONS} from './src/lib/definitions/builtins'; import fs from 'fs'; fs.writeFileSync('./src/lib/definitions/builtins.generated.json', JSON.stringify(BUILTIN_DEFINITIONS, null, 2));"
```

- [ ] **Step E:** Run `npx vitest run src/lib/definitions/__tests__/parity.test.ts` → PASS.
- [ ] **Step F:** Manually boot the game's container (Task 6 flow) and adjust env/executable if needed.
- [ ] **Step G:** Commit per game:

```bash
git add src/lib/definitions/builtins.ts src/lib/definitions/builtins.generated.json src/lib/definitions/__tests__/parity.test.ts
git commit -m "feat(definitions): seed <GAME> Linux container block"
```

---

## Final verification

- [ ] Run the complete suite: `npx vitest run` → all green.
- [ ] `npx tsc --noEmit` → no new errors introduced by this branch.
- [ ] Confirm `git status` is clean and the design doc + plan are committed.
- [ ] Manual smoke: Valheim (and any seeded games) start/stop/console/stats via Docker, and Local servers still behave exactly as before.

## Self-review notes (coverage map)

- Spec §2 container spec block → Task 1. §"Base image" default → Task 1 (`DEFAULT_STEAMCMD_IMAGE`).
- Spec §3 start/install/logs/readiness/stats/stop/update/crash-restart, tracked processes → Task 6 (helpers from Tasks 3–5).
- Spec §"Shared log helpers" → Task 5.
- Spec §4 connection wrapper + `docker-status` → Task 4.
- Spec §5 UI toggle + persist runnerType → Tasks 8–9.
- Spec §"reuse log/stats/SSE" → Task 5 (shared log file) + Task 7 (SSE route) + Task 6 (`getStats` lights up `processMonitor`).
- Spec §6 testing (pure pieces) → Tasks 1, 3, 4, 8.
- Spec §Rollout (Valheim first, rest fast-follow) → Task 2 (Valheim) + Task 6 Step 4 (verify) + Task 10 (rest).
- No DB migration anywhere (constraint honored): `container` is JSON-spec only; `runnerType` already a column.
