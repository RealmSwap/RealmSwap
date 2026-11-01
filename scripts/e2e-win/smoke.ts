/**
 * Windows CI smoke driver (Layer 3 of the zero-human test plan).
 *
 *   npx tsx scripts/e2e-win/smoke.ts --mode build-smoke     # installed-from-branch installer:
 *                                                           # boot markers, auth, real MC boot,
 *                                                           # playit tunnel (when PLAYIT_AGENT_SECRET
 *                                                           # is set), stop + cleanup
 *   npx tsx scripts/e2e-win/smoke.ts --mode release-update  # release artifacts: install the
 *                                                           # previous release, let electron-updater
 *                                                           # stage the update, apply it, relaunch at
 *                                                           # Latest and re-verify (incl. migrations)
 *   npx tsx scripts/e2e-win/smoke.ts --mode selftest        # no app needed — fake Supabase +
 *                                                           # cookie minting sanity (any platform)
 *
 * Auth is hermetic in both modes: the launched app receives SUPABASE_JWT_SECRET
 * in its environment, so the app's documented offline verification path
 * (src/lib/supabase/verifyLocal.ts) accepts HS256 tokens minted by the local
 * fake Supabase — no real Supabase project, no e2e account, no email caps. The
 * session cookie is minted directly (name `sb-<host-first-label>-auth-token`,
 * value = the raw auth-js session JSON that @supabase/ssr reads back), because
 * POST /api/auth/login talks to whichever Supabase URL was baked at build time.
 *
 * Every check lands in a machine-readable report (SMOKE_REPORT_DIR/windows-smoke-
 * report.json) plus copies of the app's startup.log and the Electron process
 * output for the workflow artifacts. Exit code is non-zero when any check failed;
 * skipped checks (e.g. tunnel without PLAYIT_AGENT_SECRET) do not fail the run.
 */

import { spawn, spawnSync, ChildProcess } from "child_process";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { ApiClient, expect } from "../e2e-api/client";
import { FakeSupabase } from "../e2e-api/fakeSupabase";
import {
  SUPABASE_JWT_SECRET,
  FAKE_SUPABASE_URL,
  FAKE_SUPABASE_PORT,
} from "../e2e-api/config";

const SMOKE_USER = {
  id: "e2ew0000-0000-4000-8000-0000000000e1",
  email: "win-smoke@realmswap.test",
  password: "win-smoke-password",
  name: "Windows Smoke",
};

const BOOT_TIMEOUT_MS = Number(process.env.SMOKE_BOOT_TIMEOUT_MS || 120_000);
const MC_BOOT_TIMEOUT_MS = Number(process.env.SMOKE_MC_BOOT_TIMEOUT_MS || 480_000);
const UPDATE_STAGE_TIMEOUT_MS = Number(process.env.SMOKE_UPDATE_STAGE_TIMEOUT_MS || 15 * 60_000);
const TUNNEL_TIMEOUT_MS = Number(process.env.SMOKE_TUNNEL_TIMEOUT_MS || 240_000);

type CheckStatus = "pass" | "fail" | "skip";
interface Check {
  id: string;
  status: CheckStatus;
  detail?: string;
  ms?: number;
}

const checks: Check[] = [];
function check(id: string, status: CheckStatus, detail?: string): void {
  checks.push({ id, status, detail });
  const icon = status === "pass" ? "✓" : status === "skip" ? "○" : "✗";
  console.log(`  ${icon} ${id}${detail ? ` — ${detail}` : ""}`);
}
async function timed(id: string, fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    check(id, "pass", detail || undefined);
  } catch (err: any) {
    check(id, "fail", err?.message ?? String(err));
  }
  const c = checks[checks.length - 1];
  c.ms = Date.now() - t0;
}

function log(msg: string): void {
  console.log(`[e2e-win] ${msg}`);
}

function reportDir(): string {
  return process.env.SMOKE_REPORT_DIR || path.join(os.tmpdir(), "realmswap-win-smoke");
}

function writeReport(extra: Record<string, unknown>): number {
  const dir = reportDir();
  fs.mkdirSync(dir, { recursive: true });
  const report = {
    runAt: new Date().toISOString(),
    mode: process.env.SMOKE_MODE || "unknown",
    platform: `${os.platform()}/${os.arch()}`,
    ...extra,
    checks,
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    skipped: checks.filter((c) => c.status === "skip").length,
  };
  const reportPath = path.join(dir, "windows-smoke-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`report written: ${reportPath}`);
  return report.failed;
}

// ---------------------------------------------------------------------------
// App launch + startup.log
// ---------------------------------------------------------------------------

interface LogCandidate {
  path: string;
  /** Only content appended after the launch counts — the default
   *  %APPDATA%\RealmSwap log carries previous launches' lines. */
  baseline: number;
}

interface LaunchedApp {
  child: ChildProcess;
  userDataDir: string;
  startupLogCandidates: LogCandidate[];
  winningLogPath: string | null;
  electronLogPath: string;
  electronLogFd: number;
  port: number | null;
}

function defaultUserDataDir(): string {
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "RealmSwap"
  );
}

function killRunningApp(): void {
  try {
    spawnSyncChecked("taskkill", ["/F", "/T", "/IM", "RealmSwap.exe"], { allowFailure: true });
  } catch {
    /* not running */
  }
}

interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function spawnSyncChecked(
  cmd: string,
  args: string[],
  opts: { allowFailure?: boolean } = {}
): SpawnResult {
  const res = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
  if (res.error) throw new Error(`${cmd} failed to spawn: ${res.error.message}`);
  if (res.status !== 0 && !opts.allowFailure) {
    throw new Error(
      `${cmd} ${args.join(" ")} exited ${res.status}` +
        (res.stderr ? `: ${res.stderr.trim().slice(0, 400)}` : "")
    );
  }
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function launchApp(exePath: string, userDataDir: string): LaunchedApp {
  killRunningApp();
  fs.mkdirSync(userDataDir, { recursive: true });
  // Fresh boot per launch in the throwaway dir; the assertions below must
  // describe THIS launch. Releases older than PR-D (#202) ignore
  // GAMEVAULT_USER_DATA_DIR, so their startup.log lands in the default
  // %APPDATA%\RealmSwap — watched as a fallback candidate with a size
  // baseline so earlier launches' lines never count.
  const primaryLog = path.join(userDataDir, "startup.log");
  try {
    if (fs.existsSync(primaryLog)) fs.rmSync(primaryLog);
  } catch {
    /* still held by the previous launch on Windows — the size baseline
     * below makes stale lines harmless */
  }
  const candidates: LogCandidate[] = [{ path: primaryLog, baseline: 0 }];
  const defaultLog = path.join(defaultUserDataDir(), "startup.log");
  if (path.resolve(defaultLog) !== path.resolve(primaryLog)) {
    candidates.push({ path: defaultLog, baseline: fs.existsSync(defaultLog) ? fs.statSync(defaultLog).size : 0 });
  }

  const child = spawn(exePath, [], {
    env: {
      ...process.env,
      GAMEVAULT_TEST_HARNESS: "1",
      GAMEVAULT_USER_DATA_DIR: userDataDir,
      SUPABASE_JWT_SECRET,
      BILLING_ENABLED: "0",
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const electronLogPath = path.join(userDataDir, "electron-output.log");
  try {
    if (fs.existsSync(electronLogPath)) fs.rmSync(electronLogPath);
  } catch {
    /* held by the previous launch's fd — stopApp closes it; appending is fine */
  }
  const electronLogFd = fs.openSync(electronLogPath, "a");
  child.stdout?.on("data", (d) => fs.writeSync(electronLogFd, d));
  child.stderr?.on("data", (d) => fs.writeSync(electronLogFd, d));
  child.on("error", (err) => fs.writeSync(electronLogFd, `[driver] spawn error: ${err}\n`));

  return {
    child,
    userDataDir,
    startupLogCandidates: candidates,
    winningLogPath: null,
    electronLogPath,
    electronLogFd,
    port: null,
  };
}

async function waitServerReady(app: LaunchedApp): Promise<number> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  // The standalone bind line prints to the piped electron stdout BEFORE
  // waitForServer resolves and the authoritative startup.log ready line is
  // appended — remember the fallback but give the log a grace window first.
  let fallbackPort: number | null = null;
  let fallbackSeenAt = 0;
  const FALLBACK_GRACE_MS = 10_000;
  while (Date.now() < deadline) {
    if (app.child.exitCode !== null && app.child.exitCode !== 0) {
      throw new Error(
        `app exited early (code ${app.child.exitCode}) — see ${app.electronLogPath}:\n${tail(readFileOrEmpty(app.electronLogPath), 2000)}`
      );
    }
    for (const cand of app.startupLogCandidates) {
      try {
        if (fs.statSync(cand.path).size <= cand.baseline) continue;
      } catch {
        continue; // not written yet
      }
      const fresh = readFileOrEmpty(cand.path).slice(cand.baseline);
      if (/STARTUP ERROR/.test(fresh)) {
        throw new Error(`startup.log contains STARTUP ERROR:\n${tail(fresh, 2000)}`);
      }
      const m = /server ready on port (\d+)/.exec(fresh);
      if (m) {
        app.winningLogPath = cand.path;
        app.port = Number(m[1]);
        return app.port;
      }
    }
    if (fallbackPort === null) {
      const m = /Local:\s+http:\/\/127\.0\.0\.1:(\d+)/.exec(readFileOrEmpty(app.electronLogPath));
      if (m) {
        fallbackPort = Number(m[1]);
        fallbackSeenAt = Date.now();
      }
    }
    if (fallbackPort !== null && Date.now() - fallbackSeenAt > FALLBACK_GRACE_MS) {
      app.port = fallbackPort;
      return fallbackPort;
    }
    await sleep(500);
  }
  const diag = app.startupLogCandidates
    .map((c) => {
      const size = fs.existsSync(c.path) ? fs.statSync(c.path).size : -1;
      return `${c.path} (exists=${size >= 0}, size=${size}, baseline=${c.baseline})`;
    })
    .join("; ");
  throw new Error(
    `no 'server ready on port N' within ${BOOT_TIMEOUT_MS}ms — watched: ${diag}` +
      (fallbackPort !== null ? ` — fallback port ${fallbackPort} seen but the ready line never landed` : "") +
      ` — electron output tail:\n${tail(readFileOrEmpty(app.electronLogPath), 2000)}`
  );
}

function readFileOrEmpty(p: string): string {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/** THIS launch's startup.log content (post-baseline). With no winning
 *  candidate (fallback port path), scan every candidate for the one that
 *  actually carries this launch's ready line. */
function readStartupLog(app: LaunchedApp): string {
  const ordered = app.winningLogPath
    ? [
        ...app.startupLogCandidates.filter((c) => c.path === app.winningLogPath),
        ...app.startupLogCandidates.filter((c) => c.path !== app.winningLogPath),
      ]
    : app.startupLogCandidates;
  for (let i = 0; i < ordered.length; i++) {
    const fresh = readFileOrEmpty(ordered[i].path).slice(ordered[i].baseline);
    if (/server ready on port \d+/.test(fresh) || i === ordered.length - 1) return fresh;
  }
  return "";
}

async function stopApp(app: LaunchedApp): Promise<void> {
  try {
    if (app.child.pid) spawnSyncChecked("taskkill", ["/F", "/T", "/PID", String(app.child.pid)], { allowFailure: true });
  } catch {
    /* already gone */
  }
  // Windows: file handles (including this driver's own electron-output fd)
  // outlive taskkill for a moment — wait the process out before closing.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && app.child.pid) {
    try {
      process.kill(app.child.pid, 0);
      await sleep(250);
    } catch {
      break; // gone
    }
  }
  try {
    fs.closeSync(app.electronLogFd);
  } catch {
    /* already closed */
  }
}

// ---------------------------------------------------------------------------
// Auth minting (offline HS256 path)
// ---------------------------------------------------------------------------

function sbCookieName(bakedSupabaseUrl: string): string {
  const ref = new URL(bakedSupabaseUrl).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

async function mintAuth(
  fake: FakeSupabase,
  client: ApiClient,
  bakedSupabaseUrl: string
): Promise<string> {
  const err = fake.signUp(SMOKE_USER.email, SMOKE_USER.password, SMOKE_USER.name);
  if (err && !err.includes("already")) throw new Error(`fake signup failed: ${err}`);
  const user = fake.signIn(SMOKE_USER.email, SMOKE_USER.password);
  if (!user) throw new Error("fake signIn returned null");
  const session = fake.sessionFor(user);
  const name = sbCookieName(bakedSupabaseUrl);
  const value = JSON.stringify(session);
  client.clearCookies();
  return `${name}=${value}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function apiRequest(
  client: ApiClient,
  cookie: string,
  method: string,
  route: string,
  body?: unknown
): Promise<{ status: number; body: any; text: string }> {
  const res = await client.request(method, route, body, {
    headers: { cookie },
  });
  return { status: res.status, body: res.body, text: res.text };
}

async function poll<T>(
  what: string,
  timeoutMs: number,
  attempt: () => Promise<T | null>
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const value = await attempt();
      if (value !== null) return value;
    } catch (err: any) {
      if (err?.fatal) throw err;
      lastErr = err?.message ?? String(err);
    }
    await sleep(2000);
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}${lastErr ? ` (last: ${lastErr})` : ""}`);
}

function fatal(message: string): Error {
  const err = new Error(message);
  (err as any).fatal = true;
  return err;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tail(text: string, max: number): string {
  return text.length <= max ? text : `…${text.slice(-max)}`;
}

function tcpAccepts(host: string, port: number, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/** "tunnel.host.playit.gg:12345" → { host, port } (port after the LAST colon). */
function parseHostPort(address: string): { host: string; port: number } | null {
  const idx = address.lastIndexOf(":");
  if (idx <= 0) return null;
  const port = Number(address.slice(idx + 1));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host: address.slice(0, idx), port };
}

function locateInstalledExe(explicit?: string): string {
  if (explicit && fs.existsSync(explicit)) return explicit;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs", "RealmSwap", "RealmSwap.exe"),
    path.join(process.env["ProgramFiles"] || "C:\\Program Files", "RealmSwap", "RealmSwap.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "RealmSwap", "RealmSwap.exe"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`RealmSwap.exe not found — tried:\n${candidates.join("\n")}`);
}

function exeProductVersion(exePath: string): string | null {
  const res = spawnSyncChecked(
    "powershell",
    ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo.ProductVersion`],
    { allowFailure: true }
  );
  const version = res.stdout.trim();
  return version || null;
}

/** ProductVersion is 4-part on installed exes ("0.5.20.0") but the release
 *  tag is 3-part — compare on major.minor.patch. */
function normVersion(v: string | null): string {
  return (v || "").trim().replace(/^v/, "").split(".").slice(0, 3).join(".");
}

// ---------------------------------------------------------------------------
// Mode: build-smoke
// ---------------------------------------------------------------------------

async function runBuildSmoke(): Promise<number> {
  const exePath = locateInstalledExe(process.env.SMOKE_EXE);
  const bakedSupabaseUrl = process.env.SMOKE_BAKED_SUPABASE_URL || FAKE_SUPABASE_URL;
  const userDataDir = process.env.SMOKE_USER_DATA_DIR || path.join(os.tmpdir(), "realmswap-win-smoke-userdata");
  const playitSecret = process.env.PLAYIT_AGENT_SECRET || "";

  log(`mode=build-smoke exe=${exePath}`);
  log(`userData=${userDataDir} bakedSupabase=${bakedSupabaseUrl} playitSecret=${playitSecret ? "provided" : "absent (tunnel checks will skip)"}`);

  const fake = new FakeSupabase();
  await fake.start();

  let app: LaunchedApp | null = null;
  let cookie = "";
  let serverId = "";
  let serverPort = 0;
  let tunnelAddress = "";

  try {
    await timed("boot/startup-log-markers", async () => {
      app = launchApp(exePath, userDataDir);
      await waitServerReady(app);
      const content = readStartupLog(app);
      expect(content.includes("startup: packaged launch"), "startup.log missing 'startup: packaged launch'");
      expect(content.includes("migrations applied:"), "startup.log missing 'migrations applied:'");
      expect(content.includes("provider keys from package:"), "startup.log missing 'provider keys from package:'");
      const keysLine = /provider keys from package: (.+)/.exec(content)?.[1] ?? "";
      expect(keysLine.includes("CURSEFORGE_API_KEY") && keysLine.includes("STEAM_API_KEY"),
        `provider keys line should carry both dummy keys, got: "${keysLine}"`);
      // /start must answer on the logged port — the same health probe main.js used.
      const health = await fetch(`http://127.0.0.1:${app!.port}/start`, { signal: AbortSignal.timeout(5000) });
      expect(health.status < 500, `GET /start on ${app!.port} → ${health.status}`);
      return `port ${app!.port}, provider keys: ${keysLine}`;
    });

    await timed("auth/minted-session-accepted", async () => {
      const client = new ApiClient(`http://127.0.0.1:${app!.port}`);
      cookie = await mintAuth(fake, client, bakedSupabaseUrl);
      const res = await apiRequest(client, cookie, "GET", "/api/servers");
      expect(res.status === 200, `GET /api/servers with minted session → ${res.status}: ${res.text.slice(0, 200)}`);
      return `cookie ${cookie.split("=")[0]} accepted`;
    });

    const client = new ApiClient(`http://127.0.0.1:${app!.port}`);

    await timed("mc/create-and-boot", async () => {
      const defs = await apiRequest(client, cookie, "GET", "/api/definitions");
      expect(defs.status === 200, `GET /api/definitions → ${defs.status}`);
      const mc = (defs.body?.definitions ?? defs.body ?? []).find?.((d: any) => d.slug === "MINECRAFT");
      expect(!!mc, "Minecraft definition must be seeded");
      const created = await apiRequest(client, cookie, "POST", "/api/servers", {
        name: "Win Smoke Vanilla MC",
        definitionId: mc.id,
        ramAllocation: 2,
      });
      expect(created.status === 201, `create → ${created.status}: ${created.text.slice(0, 300)}`);
      serverId = created.body.id;
      serverPort = created.body.port;
      expect(serverPort === 25565, `new server port → ${serverPort}, want 25565`);

      const start = await apiRequest(client, cookie, "POST", `/api/servers/${serverId}/start`);
      expect(start.status === 200, `start → ${start.status}: ${start.text.slice(0, 300)}`);
      const row = await poll("server RUNNING", MC_BOOT_TIMEOUT_MS, async () => {
        const list = await apiRequest(client, cookie, "GET", "/api/servers");
        const s = (list.body?.servers ?? []).find((x: any) => x.id === serverId);
        if (s?.status === "CRASHED") {
          throw fatal(`server CRASHED during boot — not retrying (honest readiness)`);
        }
        return s?.status === "RUNNING" ? s : null;
      });
      expect(await tcpAccepts("127.0.0.1", serverPort), `port ${serverPort} must accept after RUNNING`);
      return `${row?.name ?? serverId} RUNNING on ${serverPort}`;
    });

    await timed("mc/query-ping", async () => {
      const res = await apiRequest(client, cookie, "GET", `/api/servers/${serverId}/query`);
      expect(res.status === 200, `query → ${res.status}: ${res.text.slice(0, 200)}`);
      expect(res.body?.maxplayers >= 1, `query maxplayers → ${res.body?.maxplayers}`);
      return `max ${res.body?.maxplayers}, online ${res.body?.players}`;
    });

    await timed("mc/console-and-logs", async () => {
      const cmd = await apiRequest(client, cookie, "POST", `/api/servers/${serverId}/console`, { command: "list" });
      expect(cmd.status === 200 && cmd.body?.success === true, `console list → ${cmd.status}: ${cmd.text.slice(0, 200)}`);
      const logs = await apiRequest(client, cookie, "GET", `/api/servers/${serverId}/logs`);
      expect(logs.status === 200, `logs → ${logs.status}`);
      expect(/Done \(\d/.test(String(logs.body?.logs ?? logs.text ?? "")), "server.log tail must contain the boot Done line");
      return undefined;
    });

    if (playitSecret) {
      await timed("tunnel/start-through-relay", async () => {
        // Pre-write the agent secret so the app skips the human claim flow
        // (readPlayitSecret short-circuits claimServerTunnel) and spawns
        // playitd directly against the pre-provisioned agent.
        fs.mkdirSync(path.join(userDataDir, "playit", serverId), { recursive: true });
        fs.writeFileSync(
          path.join(userDataDir, "playit", serverId, "playit.toml"),
          `secret_key = "${playitSecret}"\n`,
          { mode: 0o600 }
        );
        const toggle = await apiRequest(client, cookie, "POST", `/api/servers/${serverId}/settings`, {
          action: "TOGGLE_TUNNEL",
          enable: true,
        });
        expect(toggle.status === 200 && toggle.body?.success === true,
          `TOGGLE_TUNNEL → ${toggle.status}: ${toggle.text.slice(0, 300)}`);
        const url = await poll("tunnel displayAddress", TUNNEL_TIMEOUT_MS, async () => {
          const conn = await apiRequest(client, cookie, "GET", `/api/servers/${serverId}/connectivity`);
          const u: string | null = conn.body?.url ?? null;
          return u || null;
        });
        tunnelAddress = String(url);
        const parsed = parseHostPort(tunnelAddress);
        expect(!!parsed, `tunnel address not host:port — "${tunnelAddress}"`);
        expect(await tcpAccepts(parsed!.host, parsed!.port, 8000),
          `relay address ${tunnelAddress} refused TCP`);
        return `${tunnelAddress} accepts TCP through the relay`;
      });

      await timed("tunnel/cleanup-on-disable", async () => {
        const toggle = await apiRequest(client, cookie, "POST", `/api/servers/${serverId}/settings`, {
          action: "TOGGLE_TUNNEL",
          enable: false,
        });
        expect(toggle.status === 200, `TOGGLE_TUNNEL off → ${toggle.status}`);
        await poll("tunnelUrl cleared", 30_000, async () => {
          const conn = await apiRequest(client, cookie, "GET", `/api/servers/${serverId}/connectivity`);
          return conn.body?.url ? null : true;
        });
        return "connectivity url cleared";
      });
    } else {
      check("tunnel/start-through-relay", "skip",
        "PLAYIT_AGENT_SECRET not set — add the repo secret (one-time; see scripts/e2e-win/README.md) to enable the tunnel proof");
      check("tunnel/cleanup-on-disable", "skip", "depends on tunnel start");
    }

    await timed("mc/stop-and-port-closed", async () => {
      const stop = await apiRequest(client, cookie, "POST", `/api/servers/${serverId}/stop`);
      expect(stop.status === 200, `stop → ${stop.status}: ${stop.text.slice(0, 300)}`);
      await poll("server STOPPED", 60_000, async () => {
        const list = await apiRequest(client, cookie, "GET", "/api/servers");
        const s = (list.body?.servers ?? []).find((x: any) => x.id === serverId);
        return s?.status === "STOPPED" ? true : null;
      });
      expect(!(await tcpAccepts("127.0.0.1", serverPort)), `port ${serverPort} still accepts after stop`);
      return `port ${serverPort} closed`;
    });
  } finally {
    if (app) await stopApp(app);
    await fake.stop().catch(() => {});
  }

  log(`build-smoke done — ${checks.filter((c) => c.status === "pass").length} passed, ` +
      `${checks.filter((c) => c.status === "fail").length} failed, ` +
      `${checks.filter((c) => c.status === "skip").length} skipped`);
  return writeReport({
    exe: exePath,
    userDataDir,
    bakedSupabaseRef: new URL(bakedSupabaseUrl).hostname.split(".")[0],
    serverId,
    serverPort,
    tunnelAddress: tunnelAddress || null,
  });
}

// ---------------------------------------------------------------------------
// Mode: release-update
// ---------------------------------------------------------------------------

async function downloadFile(url: string, dest: string): Promise<void> {
  log(`downloading ${url}`);
  const res = spawnSyncChecked("curl", ["-fL", "--retry", "3", "--retry-delay", "5", "-o", dest, url]);
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
    throw new Error(`download produced no usable file (curl status ${res.status})`);
  }
  log(`downloaded ${Math.round(fs.statSync(dest).size / 1024 / 1024)}MB → ${dest}`);
}

async function runReleaseUpdate(): Promise<number> {
  const prevUrl = process.env.SMOKE_PREV_URL || "";
  const latestVersion = (process.env.SMOKE_LATEST_VERSION || "").replace(/^v/, "");

  if (!prevUrl || !latestVersion || prevUrl === "none") {
    check("autoupdate/prereqs", "skip",
      `need SMOKE_PREV_URL + SMOKE_LATEST_VERSION (got prev=${prevUrl || "unset"}, latest=${latestVersion || "unset"})`);
    return writeReport({});
  }

  const workDir = reportDir();
  fs.mkdirSync(workDir, { recursive: true });
  // Keep the 541MB installer OUT of the artifact dir — only reports + logs land there.
  const installerDir = path.join(os.tmpdir(), "realmswap-win-smoke-installer");
  fs.mkdirSync(installerDir, { recursive: true });
  const installerPath = path.join(installerDir, "prev-RealmSwap-Setup.exe");
  const userDataDir = process.env.SMOKE_USER_DATA_DIR || path.join(os.tmpdir(), "realmswap-win-smoke-upgrade-userdata");
  let bakedSupabaseUrl = process.env.SMOKE_BAKED_SUPABASE_URL || "";
  let app: LaunchedApp | null = null;

  const fake = new FakeSupabase();
  await fake.start();

  try {
    await timed("autoupdate/download-previous-release", async () => {
      await downloadFile(prevUrl, installerPath);
      return `${Math.round(fs.statSync(installerPath).size / 1024 / 1024)}MB`;
    });

    await timed("autoupdate/install-previous-release", async () => {
      const res = spawnSyncChecked(installerPath, ["/S"]);
      if (res.status !== 0) throw new Error(`installer exited ${res.status}`);
      const exe = await poll("installed RealmSwap.exe", 60_000, async () => {
        try {
          const p = locateInstalledExe();
          return p;
        } catch {
          return null;
        }
      });
      return normVersion(exeProductVersion(exe)) || exe;
    });

    let prevExe = "";
    await timed("autoupdate/previous-release-boots", async () => {
      const exe = locateInstalledExe();
      prevExe = exe;
      app = launchApp(exe, userDataDir);
      const port = await waitServerReady(app);
      // The released app has the REAL Supabase URL baked; derive the cookie
      // name from the bundle (fallback env) since the anon URL is public.
      if (!bakedSupabaseUrl) bakedSupabaseUrl = findBakedSupabaseUrl(exe) || "";
      expect(!!bakedSupabaseUrl, "could not determine the baked Supabase URL (set SMOKE_BAKED_SUPABASE_URL)");
      const client = new ApiClient(`http://127.0.0.1:${port}`);
      const boundary = await client.get("/api/servers");
      expect(boundary.status === 401,
        `unauthenticated GET /api/servers → ${boundary.status}, want 401 (auth boundary)`);
      const cookie = await mintAuth(fake, client, bakedSupabaseUrl!);
      const res = await apiRequest(client, cookie, "GET", "/api/servers");
      if (res.status === 200) {
        return `prev ${normVersion(exeProductVersion(exe))} boots; minted offline session accepted on ${port}`;
      }
      // Releases older than 5f82fa0 (which shipped the SUPABASE_JWT_SECRET
      // offline-verify path) can only verify online against the real project,
      // so a minted token is expected to be rejected there. The boundary 401
      // above is the assertion — this job is about the update machinery.
      expect(res.status === 401,
        `GET /api/servers with minted session → ${res.status}: ${res.text.slice(0, 200)} (want 200 or the boundary 401)`);
      return `prev ${normVersion(exeProductVersion(exe))} boots; auth boundary holds (minted session rejected — build predates the offline-verify path)`;
    });

    let stagedInstaller = "";
    await timed("autoupdate/electron-updater-stages-latest", async () => {
      const pendingDir = await findUpdaterPendingDir(prevExe);
      stagedInstaller = await poll("staged update installer in pending dir", UPDATE_STAGE_TIMEOUT_MS, async () => {
        if (!fs.existsSync(pendingDir)) return null;
        for (const f of fs.readdirSync(pendingDir)) {
          // electron-updater downloads into temp-* then renames to the
          // artifact name — only the final file is a completed download.
          if (!/^realmswap-setup.*\.exe$/i.test(f) || /^temp-/i.test(f)) continue;
          const p = path.join(pendingDir, f);
          try {
            const size = fs.statSync(p).size;
            if (size <= 50 * 1024 * 1024) continue;
            await sleep(2000); // stability: still growing?
            if (fs.statSync(p).size !== size) return null;
            return p;
          } catch {
            return null; // file disappeared mid-check
          }
        }
        return null;
      });
      const stagedVersion = normVersion(exeProductVersion(stagedInstaller));
      expect(stagedVersion === normVersion(latestVersion),
        `staged installer version ${stagedVersion} ≠ latest ${normVersion(latestVersion)}`);
      return `${path.basename(stagedInstaller)} (${stagedVersion})`;
    });

    await timed("autoupdate/apply-and-relaunch-at-latest", async () => {
      if (app) await stopApp(app);
      app = null;
      // The user path applies the staged installer on quit (autoInstallOnAppQuit,
      // covered by electron/__tests__/autoUpdate.test.js + the GUI pass); here we
      // run the very installer electron-updater staged, silently, over the old
      // install — same NSIS payload the on-quit path would execute.
      const res = spawnSyncChecked(stagedInstaller, ["/S"]);
      if (res.status !== 0) throw new Error(`staged installer exited ${res.status}`);
      const exe = locateInstalledExe();
      const version = normVersion(exeProductVersion(exe));
      expect(version === normVersion(latestVersion), `installed version after update ${version} ≠ latest ${normVersion(latestVersion)}`);
      // Same userData dir → the relaunch exercises the real upgrade migration
      // path against the DB the previous release created.
      app = launchApp(exe, userDataDir);
      const port = await waitServerReady(app);
      const content = readStartupLog(app);
      expect(content.includes("migrations applied:"), "updated app startup.log missing 'migrations applied:'");
      return `now ${version}; booting on ${port} with the carried-over DB`;
    });

    await timed("autoupdate/updated-app-serves", async () => {
      expect(!!app, "updated app was not relaunched (previous step failed)");
      if (!bakedSupabaseUrl) bakedSupabaseUrl = findBakedSupabaseUrl(locateInstalledExe()) || "";
      const client = new ApiClient(`http://127.0.0.1:${app!.port}`);
      const cookie = await mintAuth(fake, client, bakedSupabaseUrl!);
      const res = await apiRequest(client, cookie, "GET", "/api/servers");
      expect(res.status === 200, `GET /api/servers on updated app → ${res.status}: ${res.text.slice(0, 200)}`);
      return "updated app serves the minted-session API";
    });
  } finally {
    if (app) await stopApp(app);
    await fake.stop().catch(() => {});
  }

  log(`release-update done — ${checks.filter((c) => c.status === "pass").length} passed, ` +
      `${checks.filter((c) => c.status === "fail").length} failed`);
  return writeReport({
    prevUrl,
    latestVersion,
    userDataDir,
    bakedSupabaseRef: bakedSupabaseUrl ? new URL(bakedSupabaseUrl).hostname.split(".")[0] : null,
  });
}

/** The inlined NEXT_PUBLIC_* value lives in the standalone bundle; the anon URL
 *  is public by design, so reading it out of the install is fine. */
function findBakedSupabaseUrl(exePath: string): string | null {
  try {
    const standaloneDir = path.join(path.dirname(exePath), "resources", "standalone");
    for (const file of walkJsFiles(standaloneDir, 4)) {
      try {
        const m = /https:\/\/[a-z0-9][a-z0-9-]*\.supabase\.co/.exec(fs.readFileSync(file, "utf8"));
        if (m) return m[0];
      } catch { /* unreadable chunk */ }
    }
    return null;
  } catch {
    return null;
  }
}

function walkJsFiles(dir: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  let out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walkJsFiles(full, maxDepth, depth + 1));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/** electron-updater's cache dir comes from app-update.yml (updaterCacheDirName). */
async function findUpdaterPendingDir(installedExe: string): Promise<string> {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  try {
    const yml = fs.readFileSync(
      path.join(path.dirname(installedExe), "resources", "app-update.yml"),
      "utf8"
    );
    const m = /updaterCacheDirName:\s*(\S+)/.exec(yml);
    if (m) return path.join(localAppData, m[1], "pending");
  } catch { /* fall through to glob */ }
  // Glob fallback: <name>-updater
  for (const entry of fs.readdirSync(localAppData)) {
    if (entry.toLowerCase().includes("realmswap") && entry.endsWith("-updater")) {
      return path.join(localAppData, entry, "pending");
    }
  }
  return path.join(localAppData, "realmswap-updater", "pending");
}

// ---------------------------------------------------------------------------
// Mode: selftest (any platform — CI for this file's pure logic)
// ---------------------------------------------------------------------------

async function runSelftest(): Promise<number> {
  await timed("selftest/fake-supabase-mints-verifiable-token", async () => {
    const fake = new FakeSupabase();
    await fake.start();
    try {
      const client = new ApiClient(`http://127.0.0.1:${FAKE_SUPABASE_PORT}`);
      // The fake's HTTP surface answers (signup → session JSON).
      const res = await client.post("/auth/v1/signup", {
        email: SMOKE_USER.email,
        password: SMOKE_USER.password,
        data: { full_name: SMOKE_USER.name },
      });
      expect(res.status === 200, `signup → ${res.status}: ${res.text.slice(0, 200)}`);
      expect(typeof res.body?.access_token === "string", "session carries an access_token");
      // The app-side offline verify accepts it with the same secret.
      const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
      const payload = jwt.verify(res.body.access_token, SUPABASE_JWT_SECRET, {
        algorithms: ["HS256"],
      }) as { sub?: string };
      expect(typeof payload.sub === "string", "token payload has a sub claim");
      // The cookie we'd mint for the app round-trips through the ssr name rule.
      const cookie = await mintAuth(fake, client, FAKE_SUPABASE_URL);
      expect(cookie.startsWith("sb-127-auth-token="), `cookie name/form unexpected: ${cookie.slice(0, 40)}…`);
      const parsedBack = JSON.parse(cookie.split("=").slice(1).join("="));
      expect(typeof parsedBack.access_token === "string", "cookie value is the raw session JSON");
      return `cookie ${cookie.split("=")[0]}, token sub ${String(payload.sub).slice(0, 8)}…`;
    } finally {
      await fake.stop();
    }
  });

  return writeReport({});
}

// ---------------------------------------------------------------------------

function parseMode(): string {
  const idx = process.argv.indexOf("--mode");
  return idx >= 0 ? process.argv[idx + 1] || "" : "";
}

async function main(): Promise<number> {
  const mode = parseMode();
  process.env.SMOKE_MODE = mode;

  let failed: number;
  switch (mode) {
    case "build-smoke":
      failed = await runBuildSmoke();
      break;
    case "release-update":
      failed = await runReleaseUpdate();
      break;
    case "selftest":
      failed = await runSelftest();
      break;
    default:
      console.error(`[e2e-win] unknown or missing --mode (got "${mode}"). Use build-smoke | release-update | selftest.`);
      return 2;
  }

  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[e2e-win] fatal: ${err?.stack || err}`);
    process.exit(1);
  });
