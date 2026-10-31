/**
 * Boot chain for the app under test:
 *   fresh DB -> prisma db push -> next build (cached by source hash) ->
 *   fake Supabase up -> next start -> health wait.
 *
 * The build goes to an isolated distDir (.next-e2e) so the developer's :3000
 * dev server is never clobbered, and `next start` has no dev-server project
 * lock to fight over.
 */

import { spawn, spawnSync, type ChildProcess } from "child_process";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import path from "path";
import {
  APP_BASE_URL,
  APP_PORT,
  APP_START_TIMEOUT_MS,
  DATA_DIR,
  DATABASE_URL,
  DIST_DIR,
  FAKE_SUPABASE_ANON_KEY,
  FAKE_SUPABASE_PORT,
  FAKE_SUPABASE_URL,
  FORCE_REBUILD,
  INTERNAL_TOKEN,
  REPO_ROOT,
  SUPABASE_JWT_SECRET,
} from "./config";
import { FakeSupabase } from "./fakeSupabase";

const OUTPUT_RING_BYTES = 256 * 1024;

export class AppError extends Error {
  constructor(message: string, public outputTail = "") {
    super(outputTail ? `${message}\n--- app output tail ---\n${outputTail}` : message);
  }
}

export interface AppHandle {
  fakeSupabase: FakeSupabase;
  stop: () => Promise<void>;
  outputTail: () => string;
}

function log(msg: string) {
  console.log(`[e2e-api] ${msg}`);
}

function npx(cmd: string, args: string[], env: Record<string, string>): ReturnType<typeof spawnSync> {
  const bin = process.platform === "win32" ? `${cmd}.cmd` : cmd;
  return spawnSync(bin, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function sourceFingerprint(): string {
  const hash = crypto.createHash("sha256");
  const inputs: string[] = ["src", "prisma/schema.prisma", "package.json", "next.config.mjs"];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(REPO_ROOT, full);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        walk(full);
      } else if (/\.(ts|tsx|mjs|js|json|prisma)$/.test(entry.name)) {
        hash.update(rel);
        hash.update(crypto.createHash("sha1").update(fs.readFileSync(full)).digest("hex"));
      }
    }
  };
  for (const input of inputs) {
    const full = path.join(REPO_ROOT, input);
    if (fs.statSync(full).isDirectory()) walk(full);
    else {
      hash.update(input);
      hash.update(crypto.createHash("sha1").update(fs.readFileSync(full)).digest("hex"));
    }
  }
  return hash.digest("hex");
}

function buildIfNeeded(): void {
  const dist = path.join(REPO_ROOT, DIST_DIR);
  const hashFile = path.join(dist, ".e2e-source-hash");
  const fingerprint = sourceFingerprint();
  if (!FORCE_REBUILD && fs.existsSync(hashFile) && fs.readFileSync(hashFile, "utf8") === fingerprint) {
    log(`build cache hit (${DIST_DIR}) — set E2E_API_REBUILD=1 to force`);
    return;
  }
  log(`building Next (${DIST_DIR})…`);
  const res = npx("npx", ["next", "build"], {
    DATABASE_URL,
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_TELEMETRY_DISABLED: "1",
    // Bake stub Supabase values so prerendering is deterministic in CI (the
    // server process gets its own env at start; NEXT_PUBLIC values here are
    // only baked into client bundles the harness never runs).
    NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: APP_BASE_URL,
  });
  if (res.status !== 0) {
    const tail = `${res.stdout?.toString().slice(-6000) ?? ""}${res.stderr?.toString().slice(-4000) ?? ""}`;
    throw new AppError(`next build failed (exit ${res.status})`, tail);
  }
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(hashFile, fingerprint);
  log("build complete");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${APP_BASE_URL}/login`, { signal: AbortSignal.timeout(3000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function startApp(): Promise<AppHandle> {
  // 1. Throwaway state: fresh DB + data dirs (runtimes/ cache survives so the
  //    JRE and SteamCMD provisioning aren't re-paid every run).
  fs.rmSync(path.join(REPO_ROOT, "prisma", "e2e-api.db"), { force: true });
  fs.rmSync(path.join(REPO_ROOT, "prisma", "e2e-api.db-journal"), { force: true });
  for (const dir of ["local-servers", "local-archives"]) {
    fs.rmSync(path.join(DATA_DIR, dir), { recursive: true, force: true });
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // 2. Schema.
  const push = npx("npx", ["prisma", "db", "push", "--skip-generate"], { DATABASE_URL });
  if (push.status !== 0) {
    throw new AppError(`prisma db push failed (exit ${push.status})`, push.stderr?.toString().slice(-4000) ?? "");
  }

  // 3. Build.
  buildIfNeeded();

  // 4. Fake Supabase.
  const fakeSupabase = new FakeSupabase();
  try {
    await fakeSupabase.start();
  } catch (err: any) {
    throw new AppError(`fake Supabase could not bind 127.0.0.1:${FAKE_SUPABASE_PORT} — is another e2e run still up? ${err.message}`);
  }
  log(`fake Supabase listening on ${FAKE_SUPABASE_URL}`);

  // 5. Next production server (detached so the whole process group — including
  //    any game servers it spawns — can be torn down reliably).
  const appEnv: Record<string, string> = {
    DATABASE_URL,
    GAMEVAULT_DATA_DIR: DATA_DIR,
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_SUPABASE_ANON_KEY,
    SUPABASE_JWT_SECRET,
    GAMEVAULT_INTERNAL_TOKEN: INTERNAL_TOKEN,
    NEXT_TELEMETRY_DISABLED: "1",
    SENTRY_DSN: "",
    NEXT_PUBLIC_SENTRY_DSN: "",
    BILLING_ENABLED: "0",
  };
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "start", "--hostname", "127.0.0.1", "--port", String(APP_PORT)],
    { cwd: REPO_ROOT, env: { ...process.env, ...appEnv }, detached: true, stdio: ["ignore", "pipe", "pipe"] }
  );

  let ring = Buffer.alloc(0);
  const capture = (chunk: Buffer) => {
    ring = Buffer.concat([ring, chunk]);
    if (ring.length > OUTPUT_RING_BYTES) ring = ring.subarray(ring.length - OUTPUT_RING_BYTES);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  log(`next start on ${APP_BASE_URL} (pid ${child.pid})…`);
  const deadline = Date.now() + APP_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await fakeSupabase.stop();
      throw new AppError(`next start exited early (code ${child.exitCode})`, ring.toString("utf8").slice(-4000));
    }
    if (await healthCheck()) {
      log("app is healthy");
      return {
        fakeSupabase,
        outputTail: () => ring.toString("utf8").slice(-6000),
        stop: () => stopApp(child, fakeSupabase),
      };
    }
    await wait(500);
  }
  await stopApp(child, fakeSupabase);
  throw new AppError(`app did not become healthy within ${APP_START_TIMEOUT_MS}ms`, ring.toString("utf8").slice(-6000));
}

async function stopApp(child: ChildProcess, fakeSupabase: FakeSupabase): Promise<void> {
  // Honest teardown first: the app's own shutdown path stops every running
  // game server, the RealmSync listener, and tunnels.
  try {
    await fetch(`${APP_BASE_URL}/api/system/shutdown`, {
      method: "POST",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // app may already be gone — fall through to the hard stop
  }
  await fakeSupabase.stop();
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve(null);
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      /* already dead */
    }
    const grace = setTimeout(() => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* already dead */
      }
      resolve(null);
    }, 5000);
    child.once("exit", () => {
      clearTimeout(grace);
      resolve(null);
    });
  });
  // Belt and braces: any stray game process bound to the app's data dir dies here.
  if (process.platform !== "win32") {
    try {
      spawnSync("pkill", ["-f", `${DATA_DIR}/local-servers`]);
    } catch {
      /* nothing to kill */
    }
  }
}
