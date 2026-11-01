#!/usr/bin/env node
/**
 * RealmSwap PC smoke harness — Layer 4 of the zero-human test plan.
 *
 * One command on the real Windows PC, against the INSTALLED app. Covers what
 * no VM can: the real router's UPnP, the real LAN/public addresses, the playit
 * relay from a real network, a full modpack pipeline on real NTFS + Defender,
 * Windows file-lock semantics, and the real auto-update path.
 *
 *   node scripts\win-smoke.mjs                 # full run (~45 min, ATM10 dominates)
 *   node scripts\win-smoke.mjs --skip pack/atm10-pipeline
 *   node scripts\win-smoke.mjs --only upnp,tunnel
 *   node scripts\win-smoke.mjs --selftest      # no app needed — pure logic, any OS
 *
 * Isolation contract: the harness launches the installed RealmSwap.exe with
 * GAMEVAULT_USER_DATA_DIR pointed at a throwaway directory, so the real
 * %APPDATA%\RealmSwap data (real servers, real DB) is never touched, and a
 * guard asserts the default location stayed silent during the run. Auth is
 * hermetic: SUPABASE_JWT_SECRET is injected into the launched app, so the
 * documented offline verification path (src/lib/supabase/verifyLocal.ts)
 * accepts the HS256 session this script mints — no login, no Supabase network.
 * The installed app must be a build that honors GAMEVAULT_USER_DATA_DIR
 * (PR-D #202, after v0.5.20) — the guard below fails honestly on older
 * installs instead of touching real data.
 *
 * Every check prints live (✓ pass / ○ skip / ✗ fail) and lands in
 * win-smoke-report.json next to this run — hand that file back.
 * Exit code is non-zero when any check failed; skips never fail.
 */

import { spawn, spawnSync } from "child_process";
import crypto from "crypto";
import dgram from "dgram";
import fs from "fs";
import http from "http";
import https from "https";
import net from "net";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Args + config
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keep" || a === "--selftest") out[a.slice(2)] = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i] ?? "";
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

const BOOT_TIMEOUT_MS = Number(process.env.WINSMOKE_BOOT_TIMEOUT_MS || 120_000);
const MC_BOOT_TIMEOUT_MS = Number(process.env.WINSMOKE_MC_BOOT_TIMEOUT_MS || 480_000);
const PACK_BOOT_TIMEOUT_MS = Number(process.env.WINSMOKE_PACK_BOOT_TIMEOUT_MS || 900_000);
const TUNNEL_TIMEOUT_MS = Number(process.env.WINSMOKE_TUNNEL_TIMEOUT_MS || 240_000);
const UPDATE_STAGE_TIMEOUT_MS = Number(process.env.WINSMOKE_UPDATE_STAGE_TIMEOUT_MS || 15 * 60_000);

const PACK_QUERY = args["pack-query"] || "All the Mods 10";
const PACK_QUERY_RE = /all the mods\s*10/i;
const PACK_RAM_GB = Number(args["pack-ram"] || 8);
const SMOKE_USER_ID = "wsm00000-0000-4000-8000-0000000000e1";
const SMOKE_EMAIL = "win-smoke@realmswap.test";
// Adrenaline — the proven retire-check artifact from the e2e-api pack scenario
// (public Modrinth pins; the harness downloads the older .mrpack itself).
const RETIRE_PACK_PROJECT = "BYN9yKrV";
const RETIRE_PACK_VERSION = "q1bUrD0m";
const RETIRE_PACK_OLDER_VERSION = "r5uSD3JV";
const CARPET_MOD_PROJECT = "TQTTVgYE";
const BOMB_JAR_NAME = "winsmoke-bomb.jar";

function wanted(id) {
  const skip = String(args.skip || "").split(",").map((s) => s.trim()).filter(Boolean);
  const only = String(args.only || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (only.length && !only.some((s) => id.startsWith(s))) return false;
  if (skip.some((s) => id.startsWith(s))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Check framework + report
// ---------------------------------------------------------------------------

const checks = [];
function check(id, status, detail) {
  checks.push({ id, status, detail, ms: undefined });
  const icon = status === "pass" ? "✓" : status === "skip" ? "○" : "✗";
  console.log(`  ${icon} ${id}${detail ? ` — ${detail}` : ""}`);
}
/**
 * Run a check; a pass records id+detail+duration. A fn that records its own
 * outcome via check() (partial skips inside a longer flow) suppresses the
 * auto-pass so the id is never recorded twice.
 */
async function timed(id, fn) {
  if (!wanted(id)) return;
  const t0 = Date.now();
  try {
    const detail = await fn();
    if (checks[checks.length - 1]?.id !== id) check(id, "pass", detail || undefined);
  } catch (err) {
    check(id, "fail", err?.message ?? String(err));
  }
  const last = checks.findLast((c) => c.id === id);
  if (last) last.ms = Date.now() - t0;
}

function log(msg) {
  console.log(`[win-smoke] ${msg}`);
}
function tail(text, max) {
  return text.length <= max ? text : `…${text.slice(-max)}`;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function fatal(message) {
  const err = new Error(message);
  err.fatal = true;
  return err;
}

async function poll(what, timeoutMs, attempt) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const value = await attempt();
      if (value !== null && value !== undefined) return value;
    } catch (err) {
      if (err?.fatal) throw err;
      lastErr = err?.message ?? String(err);
    }
    await sleep(2000);
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}${lastErr ? ` (last: ${lastErr})` : ""}`);
}

const extra = {}; // report payload, filled as the run progresses
let currentCookie = "";
let currentJwtSecret = "";
let currentUpnpEndpoint = null;
const upnpTouchedPorts = [];

function writeReport(extraPayload) {
  const report = {
    runAt: new Date().toISOString(),
    harness: "scripts/win-smoke.mjs",
    platform: `${os.platform()}/${os.arch()}`,
    osRelease: os.release(),
    ...extraPayload,
    checks,
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    skipped: checks.filter((c) => c.status === "skip").length,
  };
  const dir = args["report-dir"] || process.cwd();
  const reportPath = path.join(dir, "win-smoke-report.json");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`report written: ${reportPath}`);
  } catch (err) {
    log(`could not write report: ${err.message}`);
  }
  return report.failed;
}

function printSummary() {
  console.log("\n  ==================== PASS/FAIL ====================");
  for (const c of checks) {
    const ms = c.ms != null ? ` (${Math.round(c.ms / 1000)}s)` : "";
    console.log(`  ${c.status === "pass" ? "PASS" : c.status === "skip" ? "SKIP" : "FAIL"}  ${c.id}${ms}${c.detail ? ` — ${c.detail.slice(0, 160)}` : ""}`);
  }
  const p = checks.filter((c) => c.status === "pass").length;
  const f = checks.filter((c) => c.status === "fail").length;
  const s = checks.filter((c) => c.status === "skip").length;
  console.log("  ===================================================");
  console.log(`  ${p} passed, ${f} failed, ${s} skipped\n`);
}

// ---------------------------------------------------------------------------
// HTTP helper (node:http(s) — no fetch, so a 20-minute pack POST can't be
// cut off by undici's default headers timeout)
// ---------------------------------------------------------------------------

function request(method, url, { headers = {}, body = null, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* non-JSON body */
          }
          resolve({ status: res.statusCode, text, json, headers: res.headers });
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`request timed out after ${timeoutMs}ms: ${method} ${url}`)));
    req.on("error", reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

function tcpAccepts(host, port, timeoutMs = 5000) {
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

/** TCP connect latency (ms) through a relay — median of n attempts. */
async function tcpLatencyMs(host, port, samples = 3) {
  const times = [];
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    if (await tcpAccepts(host, port, 8000)) times.push(Date.now() - t0);
    await sleep(300);
  }
  if (!times.length) return null;
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

function parseHostPort(address) {
  const idx = String(address).lastIndexOf(":");
  if (idx <= 0) return null;
  const port = Number(address.slice(idx + 1));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host: address.slice(0, idx), port };
}

function lanIPv4() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal && !iface.address.startsWith("169.254.")) {
        return iface.address;
      }
    }
  }
  return null;
}

async function publicIPv4() {
  try {
    const res = await request("GET", "https://api.ipify.org?format=json", { timeoutMs: 8000 });
    return res.json?.ip ?? null;
  } catch {
    return null;
  }
}

function downloadToFile(url, dest, redirects = 3) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === "https:" ? https : http;
    const req = mod.get(urlObj, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        downloadToFile(new URL(res.headers.location, urlObj).toString(), dest, redirects - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });
    req.setTimeout(10 * 60_000, () => req.destroy(new Error(`download timed out: ${url}`)));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Hermetic auth — mint the session the app's offline verify path accepts
// (mirrors scripts/e2e-api/fakeSupabase.ts + scripts/e2e-win/smoke.ts)
// ---------------------------------------------------------------------------

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mintAccessToken(secret, { sub, email }) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub,
      email,
      role: "authenticated",
      aud: "authenticated",
      user_metadata: { full_name: "Windows PC Smoke" },
      app_metadata: { provider: "email", providers: ["email"] },
      iat: now,
      exp: now + 60 * 60 * 24,
    })
  );
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function sbCookieName(supabaseUrl) {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

function mintSessionCookie(secret, supabaseUrl) {
  const session = {
    access_token: mintAccessToken(secret, { sub: SMOKE_USER_ID, email: SMOKE_EMAIL }),
    token_type: "bearer",
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    refresh_token: "winsmoke-refresh",
    user: {
      id: SMOKE_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: SMOKE_EMAIL,
      user_metadata: { full_name: "Windows PC Smoke" },
    },
  };
  return `${sbCookieName(supabaseUrl)}=${JSON.stringify(session)}`;
}

/** The inlined NEXT_PUBLIC_* value lives in the standalone bundle; the anon
 *  URL is public by design, so reading it out of the install is fine. */
function findBakedSupabaseUrl(exePath) {
  const standaloneDir = path.join(path.dirname(exePath), "resources", "standalone");
  const stack = [[standaloneDir, 0]];
  while (stack.length) {
    const [dir, depth] = stack.pop();
    if (depth > 4) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push([full, depth + 1]);
      else if (entry.isFile() && entry.name.endsWith(".js")) {
        try {
          const m = /https:\/\/[a-z0-9][a-z0-9-]*\.supabase\.co/.exec(fs.readFileSync(full, "utf8"));
          if (m) return m[0];
        } catch {
          /* unreadable chunk */
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal UPnP IGD client (harness-side router truth — mirrors src/lib/upnp.ts)
// ---------------------------------------------------------------------------

const UPNP_SSDP_ADDR = "239.255.255.250";
const UPNP_SSDP_PORT = 1900;
const UPNP_STS = [
  "urn:schemas-upnp-org:service:WANIPConnection:2",
  "urn:schemas-upnp-org:service:WANIPConnection:1",
  "urn:schemas-upnp-org:service:WANPPPConnection:1",
];

function ssdpDiscover(timeoutMs = 3500) {
  return new Promise((resolve) => {
    const found = new Set();
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        sock.close();
      } catch {
        /* already closed */
      }
      resolve(Array.from(found));
    };
    sock.on("message", (buf) => {
      const m = /^LOCATION:\s*(\S+)\s*$/im.exec(buf.toString());
      if (m) found.add(m[1]);
    });
    sock.on("error", finish);
    sock.bind(() => {
      for (const st of UPNP_STS) {
        sock.send(
          `M-SEARCH * HTTP/1.1\r\nHOST: ${UPNP_SSDP_ADDR}:${UPNP_SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: 3\r\nST: ${st}\r\n\r\n`,
          UPNP_SSDP_PORT,
          UPNP_SSDP_ADDR
        );
      }
      setTimeout(finish, timeoutMs).unref();
    });
  });
}

function httpGetBody(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === "https:" ? https : http;
    const req = mod.get(urlObj, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

function pickUpnpService(xml) {
  const blocks = xml.match(/<service>[\s\S]*?<\/service>/g) ?? [];
  const candidates = [];
  for (const block of blocks) {
    const serviceType = block.match(/<serviceType>\s*([^<]+?)\s*<\/serviceType>/)?.[1];
    const controlUrl = block.match(/<controlURL>\s*([^<]+?)\s*<\/controlURL>/)?.[1];
    if (!serviceType || !controlUrl) continue;
    if (/WAN(IP|PPP)Connection/.test(serviceType)) candidates.push({ serviceType, controlUrl });
  }
  const rank = (e) =>
    e.serviceType.includes("WANIPConnection:2") ? 0 : e.serviceType.includes("WANIPConnection:1") ? 1 : e.serviceType.includes("WANPPPConnection") ? 2 : 3;
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0] ?? null;
}

async function upnpEndpoint() {
  const locations = await ssdpDiscover();
  for (const location of locations.slice(0, 4)) {
    const xml = await httpGetBody(location);
    if (!xml) continue;
    const picked = pickUpnpService(xml);
    if (picked) return { ...picked, controlUrl: new URL(picked.controlUrl, location).toString() };
  }
  return null;
}

function upnpSoap(endpoint, action, argsXml, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const envelope =
      `<?xml version="1.0"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
      `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>` +
      `<u:${action} xmlns:u="${endpoint.serviceType}">${argsXml}</u:${action}>` +
      `</s:Body></s:Envelope>`;
    const data = Buffer.from(envelope, "utf8");
    const urlObj = new URL(endpoint.controlUrl);
    const mod = urlObj.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": `text/xml; charset="utf-8"`,
          SOAPAction: `"${endpoint.serviceType}#${action}"`,
          "Content-Length": data.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          const errCode = raw.match(/<errorCode>\s*(\d+)\s*<\/errorCode>/)?.[1];
          resolve({ status: res.statusCode, body: raw, errorCode: errCode ? Number(errCode) : null });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("SOAP request timed out")));
    req.on("error", (e) => resolve({ status: 0, body: e.message, errorCode: null }));
    req.end(data);
  });
}

function getMappingArgs(port, protocol) {
  return `<NewRemoteHost></NewRemoteHost><NewExternalPort>${port}</NewExternalPort><NewProtocol>${protocol}</NewProtocol>`;
}

/**
 * Ask the ROUTER whether the mapping exists (GetSpecificPortMappingEntry —
 * the same question the internet asks). Returns
 * "present" | "absent" (IGD error 714 = no such entry) | "unknown".
 */
async function upnpMappingState(endpoint, port, protocol) {
  const res = await upnpSoap(endpoint, "GetSpecificPortMappingEntry", getMappingArgs(port, protocol));
  if (res.status === 200 && /NewInternalPort/.test(res.body)) return "present";
  if (res.errorCode === 714) return "absent";
  return "unknown";
}

/** Best-effort cleanup: delete a mapping if this run left one behind. */
async function upnpDeleteMapping(endpoint, port, protocol) {
  await upnpSoap(endpoint, "DeletePortMapping", getMappingArgs(port, protocol));
}

// ---------------------------------------------------------------------------
// check-host.net external TCP probe (free, no key; ~4 nodes)
// ---------------------------------------------------------------------------

async function checkHostTcp(host, port, timeoutMs = 75_000) {
  let submit;
  try {
    submit = await request(
      "GET",
      `https://check-host.net/check-tcp?host=${encodeURIComponent(`${host}:${port}`)}&max_nodes=4`,
      { headers: { Accept: "application/json" }, timeoutMs: 15_000 }
    );
  } catch (err) {
    return { state: "service-unavailable", detail: err.message };
  }
  const requestId = submit.json?.request_id;
  if (submit.status !== 200 || !requestId) {
    return { state: "service-unavailable", detail: `check-host.net responded ${submit.status}` };
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(4000);
    let res;
    try {
      res = await request("GET", `https://check-host.net/check-result/${requestId}`, {
        headers: { Accept: "application/json" },
        timeoutMs: 15_000,
      });
    } catch {
      continue;
    }
    const nodes = res.json ?? {};
    const values = Object.values(nodes).flat();
    if (!values.length) continue; // nothing assigned yet
    if (values.some((v) => v === null || v === undefined)) continue; // still pending
    const ok = values.filter((v) => v?.status === "ok").length;
    if (ok > 0) return { state: "reachable", detail: `${ok}/${values.length} probe nodes connected` };
    return { state: "refused", detail: values[0]?.message || "all probe nodes failed to connect" };
  }
  return { state: "timeout", detail: "no complete probe results in time" };
}

// ---------------------------------------------------------------------------
// Store-only ZIP builder (the boot-test bomb jar) — pure Node, no deps
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Store-only (no compression) zip — every unzip, incl. adm-zip, reads it. */
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

function makeBombJar() {
  return buildZip([
    {
      name: "fabric.mod.json",
      data: Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          id: "winsmokebomb",
          version: "1.0.0",
          name: "Win Smoke Bomb",
          environment: "*",
          entrypoints: { main: ["com.winsmokebomb.Bomb"] },
        })
      ),
    },
    { name: "com/winsmokebomb/Bomb.class", data: Buffer.from("not actually a jvm class file") },
  ]);
}

// ---------------------------------------------------------------------------
// multipart/form-data builder (import-modpack)
// ---------------------------------------------------------------------------

function multipartBody(fieldName, file, extraFields = {}) {
  const boundary = `winsmoke-${crypto.randomBytes(12).toString("hex")}`;
  const parts = [];
  for (const [k, v] of Object.entries(extraFields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        "utf8"
      )
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
      "utf8"
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
  );
  return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat(parts) };
}

// ---------------------------------------------------------------------------
// App lifecycle (patterns from scripts/e2e-win/smoke.ts, minus killRunningApp —
// on the PC a running instance is the user's app and must never be killed)
// ---------------------------------------------------------------------------

let launched = null; // { child, userDataDir, logCandidates, winningLogPath, electronLogPath, electronLogFd, port }

function defaultUserDataDir() {
  return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "RealmSwap");
}

function locateInstalledExe(explicit) {
  if (explicit && fs.existsSync(explicit)) return explicit;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs", "RealmSwap", "RealmSwap.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "RealmSwap", "RealmSwap.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "RealmSwap", "RealmSwap.exe"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`RealmSwap.exe not found — tried:\n${candidates.join("\n")}`);
}

function exeProductVersion(exePath) {
  const res = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo.ProductVersion`],
    { encoding: "utf8", windowsHide: true }
  );
  return (res.stdout || "").trim() || null;
}

/** ProductVersion is 4-part ("0.5.20.0"); release tags are 3-part. */
function normVersion(v) {
  return (v || "").trim().replace(/^v/, "").split(".").slice(0, 3).join(".");
}

function isAppRunning() {
  const res = spawnSync("tasklist", ["/FI", "IMAGENAME eq RealmSwap.exe", "/NH"], { encoding: "utf8", windowsHide: true });
  return /realmswap\.exe/i.test(res.stdout || "");
}

function readFileOrEmpty(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function launchApp(exePath, userDataDir, jwtSecret) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const primaryLog = path.join(userDataDir, "startup.log");
  try {
    if (fs.existsSync(primaryLog)) fs.rmSync(primaryLog);
  } catch {
    /* held by a previous launch — the size baseline makes stale lines harmless */
  }
  const logCandidates = [{ path: primaryLog, baseline: 0 }];
  const defaultLog = path.join(defaultUserDataDir(), "startup.log");
  if (path.resolve(defaultLog) !== path.resolve(primaryLog)) {
    logCandidates.push({
      path: defaultLog,
      baseline: fs.existsSync(defaultLog) ? fs.statSync(defaultLog).size : 0,
    });
  }
  const child = spawn(exePath, [], {
    env: {
      ...process.env,
      GAMEVAULT_TEST_HARNESS: "1",
      GAMEVAULT_USER_DATA_DIR: userDataDir,
      SUPABASE_JWT_SECRET: jwtSecret,
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
    /* held — appending is fine */
  }
  const electronLogFd = fs.openSync(electronLogPath, "a");
  child.stdout?.on("data", (d) => fs.writeSync(electronLogFd, d));
  child.stderr?.on("data", (d) => fs.writeSync(electronLogFd, d));
  child.on("error", (err) => fs.writeSync(electronLogFd, `[win-smoke] spawn error: ${err}\n`));
  launched = { child, userDataDir, logCandidates, winningLogPath: null, electronLogPath, electronLogFd, port: null };
  return launched;
}

/** THIS launch's startup.log content (post-baseline, winning candidate first). */
function readStartupLog() {
  const ordered = launched.winningLogPath
    ? [
        ...launched.logCandidates.filter((c) => c.path === launched.winningLogPath),
        ...launched.logCandidates.filter((c) => c.path !== launched.winningLogPath),
      ]
    : launched.logCandidates;
  for (let i = 0; i < ordered.length; i++) {
    const fresh = readFileOrEmpty(ordered[i].path).slice(ordered[i].baseline);
    if (/server ready on port \d+/.test(fresh) || i === ordered.length - 1) return fresh;
  }
  return "";
}

async function waitServerReady() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  let fallbackPort = null;
  let fallbackSeenAt = 0;
  const FALLBACK_GRACE_MS = 10_000;
  while (Date.now() < deadline) {
    if (launched.child.exitCode !== null && launched.child.exitCode !== 0) {
      throw new Error(
        `app exited early (code ${launched.child.exitCode}) — see ${launched.electronLogPath}:\n${tail(readFileOrEmpty(launched.electronLogPath), 2000)}`
      );
    }
    for (const cand of launched.logCandidates) {
      try {
        if (fs.statSync(cand.path).size <= cand.baseline) continue;
      } catch {
        continue;
      }
      const fresh = readFileOrEmpty(cand.path).slice(cand.baseline);
      if (/STARTUP ERROR/.test(fresh)) {
        throw new Error(`startup.log contains STARTUP ERROR:\n${tail(fresh, 2000)}`);
      }
      const m = /server ready on port (\d+)/.exec(fresh);
      if (m) {
        launched.winningLogPath = cand.path;
        launched.port = Number(m[1]);
        return launched.port;
      }
    }
    if (fallbackPort === null) {
      const m = /Local:\s+http:\/\/127\.0\.0\.1:(\d+)/.exec(readFileOrEmpty(launched.electronLogPath));
      if (m) {
        fallbackPort = Number(m[1]);
        fallbackSeenAt = Date.now();
      }
    }
    if (fallbackPort !== null && Date.now() - fallbackSeenAt > FALLBACK_GRACE_MS) {
      launched.port = fallbackPort;
      return fallbackPort;
    }
    await sleep(500);
  }
  throw new Error(`no 'server ready on port N' within ${Math.round(BOOT_TIMEOUT_MS / 1000)}s — electron output tail:\n${tail(readFileOrEmpty(launched.electronLogPath), 2000)}`);
}

async function stopApp() {
  if (!launched?.child?.pid) return;
  try {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(launched.child.pid)], { windowsHide: true });
  } catch {
    /* already gone */
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(launched.child.pid, 0);
      await sleep(250);
    } catch {
      break;
    }
  }
  try {
    fs.closeSync(launched.electronLogFd);
  } catch {
    /* already closed */
  }
}

// ---------------------------------------------------------------------------
// API helpers against the launched app
// ---------------------------------------------------------------------------

function apiBase() {
  return `http://127.0.0.1:${launched.port}`;
}

async function api(method, route, { cookie, body, timeoutMs = 30_000, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  let payload = null;
  if (body !== undefined && body !== null) {
    if (Buffer.isBuffer(body)) {
      payload = body;
      h["content-type"] = h["content-type"] || "application/octet-stream";
    } else {
      payload = Buffer.from(JSON.stringify(body), "utf8");
      h["content-type"] = "application/json";
    }
    h["content-length"] = payload.length;
  }
  const res = await request(method, `${apiBase()}${route}`, { headers: h, body: payload, timeoutMs });
  return { status: res.status, body: res.json, text: res.text };
}

async function createServer(cookie, name, definitionId, { enableUpnp, ramGB = 2 } = {}) {
  const created = await api("POST", "/api/servers", {
    cookie,
    body: { name, definitionId, ramAllocation: ramGB, enableUpnp: !!enableUpnp },
  });
  expect(created.status === 201, `create → ${created.status}: ${created.text.slice(0, 300)}`);
  return created.body;
}

async function startAndWaitRunning(cookie, serverId, name, timeoutMs) {
  const start = await api("POST", `/api/servers/${serverId}/start`, { cookie });
  expect(start.status === 200, `start → ${start.status}: ${start.text.slice(0, 300)}`);
  const t0 = Date.now();
  await poll(`${name} RUNNING`, timeoutMs, async () => {
    const list = await api("GET", "/api/servers", { cookie });
    const s = (list.body?.servers ?? []).find((x) => x.id === serverId);
    if (s?.status === "CRASHED") throw fatal(`${name} CRASHED during boot — honest readiness, not retrying`);
    return s?.status === "RUNNING" ? s : null;
  });
  return Date.now() - t0;
}

async function stopAndWaitStopped(cookie, serverId) {
  const stop = await api("POST", `/api/servers/${serverId}/stop`, { cookie });
  expect(stop.status === 200, `stop → ${stop.status}: ${stop.text.slice(0, 300)}`);
  await poll("server STOPPED", 90_000, async () => {
    const list = await api("GET", "/api/servers", { cookie });
    const s = (list.body?.servers ?? []).find((x) => x.id === serverId);
    return s?.status === "STOPPED" ? true : null;
  });
}

function modsDir(serverId) {
  return path.join(launched.userDataDir, "local-servers", serverId, "mods");
}

// ---------------------------------------------------------------------------
// Selftest — every pure helper in this file, no app, any OS
// ---------------------------------------------------------------------------

async function runSelftest() {
  console.log("[win-smoke] selftest (no app needed)\n");
  await timed("selftest/jwt-mint-verifies", async () => {
    const secret = "selftest-secret";
    const token = mintAccessToken(secret, { sub: SMOKE_USER_ID, email: SMOKE_EMAIL });
    const [h, p, sig] = token.split(".");
    const expectedSig = b64url(crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest());
    expect(sig === expectedSig, "HMAC signature must round-trip");
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    expect(payload.sub === SMOKE_USER_ID, "payload sub must round-trip");
    expect(payload.role === "authenticated" && payload.aud === "authenticated", "auth-js claims present");
    return `sub ${payload.sub}`;
  });
  await timed("selftest/cookie-name-and-session-shape", async () => {
    expect(sbCookieName("https://ukfoplaceholder.supabase.co") === "sb-ukfoplaceholder-auth-token", "cookie name from real-shaped URL");
    expect(sbCookieName("http://127.0.0.1:54321") === "sb-127-auth-token", "cookie name from loopback URL");
    const cookie = mintSessionCookie("selftest-secret", "https://ukfoplaceholder.supabase.co");
    const value = cookie.split("=").slice(1).join("=");
    const session = JSON.parse(value);
    expect(typeof session.access_token === "string" && session.access_token.split(".").length === 3, "session carries a JWT");
    expect(typeof session.expires_at === "number" && session.user?.id === SMOKE_USER_ID, "session carries expiry + user");
    return `${cookie.split("=")[0]} accepted-shape`;
  });
  await timed("selftest/bomb-jar-zip-is-well-formed", async () => {
    const zip = makeBombJar();
    expect(zip.readUInt32LE(0) === 0x04034b50, "local file header magic");
    const eocdOffset = zip.length - 22;
    expect(zip.readUInt32LE(eocdOffset) === 0x06054b50, "EOCD magic");
    expect(zip.readUInt16LE(eocdOffset + 10) === 2, "two entries declared");
    const firstLen = zip.readUInt32LE(18);
    const firstCrc = zip.readUInt32LE(14);
    const dataStart = 30 + zip.readUInt16LE(26);
    expect(crc32(zip.subarray(dataStart, dataStart + firstLen)) === firstCrc, "entry CRC round-trips");
    expect(zip.toString("latin1").includes("fabric.mod.json"), "fabric.mod.json present");
    return `${zip.length} bytes`;
  });
  await timed("selftest/multipart-and-version-helpers", async () => {
    const { contentType, body } = multipartBody("modpack", { filename: "test.mrpack", data: Buffer.from("x") }, { installId: "abc123" });
    expect(contentType.startsWith("multipart/form-data; boundary=winsmoke-"), "boundary header");
    expect(body.toString("utf8").includes('name="modpack"; filename="test.mrpack"'), "file part");
    expect(body.toString("utf8").includes('name="installId"'), "extra field");
    expect(normVersion("0.5.20.0") === "0.5.20", "4-part version normalized");
    expect(normVersion("v0.6.0") === "0.6.0", "tag prefix stripped");
    return undefined;
  });
  await timed("selftest/upnp-xml-and-arg-helpers", async () => {
    const xml = `<service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:2</serviceType><controlURL>/ctl/IPConn</controlURL></service>`;
    const picked = pickUpnpService(xml);
    expect(picked?.serviceType.includes("WANIPConnection:2"), "v2 service picked");
    const packet = "HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.1:49152/desc.xml\r\nST: urn:schemas-upnp-org:service:WANIPConnection:1\r\n\r\n";
    expect(/^LOCATION:\s*(\S+)\s*$/im.exec(packet)?.[1] === "http://192.168.1.1:49152/desc.xml", "SSDP LOCATION parsed");
    expect(getMappingArgs(25565, "TCP").includes("<NewExternalPort>25565</NewExternalPort>"), "mapping args XML");
    return undefined;
  });
  await timed("selftest/report-writer", async () => {
    const failed = writeReport({ selftest: true });
    expect(failed === 0, "selftest report must carry zero failures");
    return "report written";
  });
  printSummary();
  return checks.filter((c) => c.status === "fail").length;
}

// ---------------------------------------------------------------------------
// The PC smoke
// ---------------------------------------------------------------------------

async function runPcSmoke() {
  currentJwtSecret = crypto.randomBytes(32).toString("hex");
  const bootTimes = {};
  let exePath = null;
  let bootOk = false;

  await timed("preflight/app-found", async () => {
    exePath = locateInstalledExe(args.app);
    const version = normVersion(exeProductVersion(exePath));
    extra.exe = exePath;
    extra.installedVersion = version;
    expect(!!version, "installed exe carries a ProductVersion");
    return `RealmSwap ${version} at ${exePath}`;
  });

  await timed("preflight/no-instance-running", async () => {
    if (isAppRunning()) {
      throw fatal(
        "RealmSwap.exe is already running — the single-instance lock would make the harness launch a no-op. " +
          "Quit RealmSwap (tray → Quit) and re-run. The harness never kills your running app."
      );
    }
    return "no running instance";
  });

  await timed("boot/launch-isolated-data", async () => {
    expect(!!exePath, "no app to launch (preflight failed)");
    const userDataDir = path.join(os.tmpdir(), `winsmoke-userdata-${Date.now()}`);
    extra.userDataDir = userDataDir;
    const defaultLog = path.join(defaultUserDataDir(), "startup.log");
    const defaultLogBaseline = fs.existsSync(defaultLog) ? fs.statSync(defaultLog).size : 0;
    launchApp(exePath, userDataDir, currentJwtSecret);
    const port = await waitServerReady();
    extra.appPort = port;
    // The isolation guard: an install that predates GAMEVAULT_USER_DATA_DIR
    // (#202) writes to %APPDATA%\RealmSwap — real data. Fail honestly.
    const grew = fs.existsSync(defaultLog) && fs.statSync(defaultLog).size > defaultLogBaseline;
    expect(
      !grew,
      "the installed app IGNORED GAMEVAULT_USER_DATA_DIR and wrote to %APPDATA%\\RealmSwap — it predates PR-D #202. " +
        "Update the installed app to a release containing it, then re-run. (This run wrote one log line there, nothing else.)"
    );
    const content = readStartupLog();
    expect(content.includes("startup: packaged launch"), "startup.log missing 'startup: packaged launch'");
    expect(content.includes("migrations applied:"), "startup.log missing 'migrations applied:'");
    expect(content.includes("provider keys from package:"), "startup.log missing 'provider keys from package:'");
    const keysLine = /provider keys from package: (.+)/.exec(content)?.[1] ?? "";
    expect(keysLine.includes("CURSEFORGE_API_KEY"), `provider keys line lacks CURSEFORGE_API_KEY: "${keysLine}"`);
    const health = await request("GET", `${apiBase()}/start`, { timeoutMs: 5000 });
    expect(health.status < 500, `GET /start → ${health.status}`);
    bootOk = true;
    return `port ${port}, keys: ${keysLine}`;
  });

  if (!bootOk) {
    check("run/aborted-after-boot-failure", "skip", "the app never became ready — remaining checks skipped");
    printSummary();
    return writeReport(extra);
  }

  await timed("auth/minted-session-accepted", async () => {
    const baked = findBakedSupabaseUrl(exePath);
    expect(!!baked, "could not find the baked Supabase URL in the standalone bundle");
    extra.bakedSupabaseRef = new URL(baked).hostname.split(".")[0];
    currentCookie = mintSessionCookie(currentJwtSecret, baked);
    const res = await api("GET", "/api/servers", { cookie: currentCookie });
    expect(res.status === 200, `GET /api/servers with minted session → ${res.status}: ${res.text.slice(0, 200)}`);
    return `${currentCookie.split("=")[0]} accepted`;
  });

  let mcDef = null;
  await timed("auth/definitions-seeded", async () => {
    const defs = await api("GET", "/api/definitions", { cookie: currentCookie });
    expect(defs.status === 200, `GET /api/definitions → ${defs.status}`);
    mcDef = (defs.body?.definitions ?? defs.body ?? []).find?.((d) => d.slug === "MINECRAFT");
    expect(!!mcDef, "Minecraft definition must be seeded");
    return undefined;
  });

  extra.publicIp = await publicIPv4();
  extra.lanIp = lanIPv4();

  let upnpEpDetail = "SSDP discovery found no UPnP gateway — router-truth asserts fall back to the app's report";
  let upnpDiscovered = false;

  // ---- Server A: UPnP + public identity + tunnel ----
  let serverA = null;
  await timed("upnp/public-server-boot", async () => {
    expect(!!mcDef, "no Minecraft definition (auth checks failed)");
    expect(!!extra.lanIp, "this machine has no LAN IPv4 — cannot run the network checks");
    serverA = await createServer(currentCookie, "WinSmoke UPnP", mcDef.id, { enableUpnp: true });
    extra.serverA = { id: serverA.id, port: serverA.port };
    upnpTouchedPorts.push(serverA.port);
    bootTimes.vanillaUpnpMs = await startAndWaitRunning(currentCookie, serverA.id, "WinSmoke UPnP", MC_BOOT_TIMEOUT_MS);
    return `server ${serverA.id} RUNNING on ${serverA.port} in ${Math.round(bootTimes.vanillaUpnpMs / 1000)}s`;
  });

  await timed("upnp/connectivity-public", async () => {
    expect(!!serverA, "UPnP server did not boot");
    const conn = await api("GET", `/api/servers/${serverA.id}/connectivity`, { cookie: currentCookie });
    expect(conn.status === 200, `connectivity → ${conn.status}: ${conn.text.slice(0, 200)}`);
    const router = conn.body?.report?.checks?.find((c) => c.id === "router");
    expect(router?.status === "ok", `router check → ${router?.status}: ${router?.detail}`);
    expect(!!extra.publicIp, "ipify lookup failed — cannot assert the public address honestly");
    expect(
      String(router?.detail ?? "").includes(extra.publicIp),
      `router check detail should carry the public IP ${extra.publicIp}, got: "${router?.detail}"`
    );
    expect(conn.body?.invite?.addressPath === "public", `addressPath → ${conn.body?.invite?.addressPath}, want "public"`);
    expect(
      conn.body?.invite?.address === `${extra.publicIp}:${serverA.port}`,
      `invite address → ${conn.body?.invite?.address}, want ${extra.publicIp}:${serverA.port}`
    );
    extra.joinInfoPublic = conn.body?.invite?.address;
    return `address ${conn.body.invite.address} via "${conn.body.invite.addressPath}"`;
  });

  await timed("upnp/router-mapping-truth", async () => {
    expect(!!serverA, "UPnP server did not boot");
    currentUpnpEndpoint = await upnpEndpoint();
    if (!currentUpnpEndpoint) {
      check("upnp/router-mapping-truth", "skip", `${upnpEpDetail}; app-side evidence above stands`);
      return;
    }
    upnpDiscovered = true;
    extra.upnpEndpoint = new URL(currentUpnpEndpoint.controlUrl).host;
    upnpEpDetail = `${extra.upnpEndpoint} (${currentUpnpEndpoint.serviceType})`;
    const tcp = await upnpMappingState(currentUpnpEndpoint, serverA.port, "TCP");
    const udp = await upnpMappingState(currentUpnpEndpoint, serverA.port, "UDP");
    extra.routerMapping = { tcp, udp };
    expect(tcp === "present", `router reports TCP ${serverA.port} mapping → ${tcp} (unknown = ${upnpEpDetail})`);
    return `TCP present, UDP ${udp} — ${upnpEpDetail}`;
  });

  await timed("upnp/external-reachability", async () => {
    expect(!!serverA && !!extra.publicIp, "needs the booted UPnP server + public IP");
    const probe = await checkHostTcp(extra.publicIp, serverA.port);
    if (probe.state === "reachable") {
      extra.externalProbe = probe.state;
      return probe.detail;
    }
    if (probe.state === "refused") {
      throw new Error(
        `external probe: ${probe.detail} — the port is NOT reachable from the internet. ` +
          `If the router mapping is present (above), Windows Firewall is the usual remaining blocker: ` +
          `allow the game's java.exe through Defender for inbound TCP ${serverA.port}.`
      );
    }
    check("upnp/external-reachability", "skip", `check-host.net unavailable (${probe.state}: ${probe.detail}) — mapping + router truth above stand`);
  });

  await timed("mc/query-and-console", async () => {
    expect(!!serverA, "UPnP server did not boot");
    const query = await poll("query online", 90_000, async () => {
      const r = await api("GET", `/api/servers/${serverA.id}/query`, { cookie: currentCookie });
      return r.status === 200 && r.body?.status === "online" ? r : null;
    });
    const cmd = await api("POST", `/api/servers/${serverA.id}/console`, { cookie: currentCookie, body: { command: "list" } });
    expect(cmd.status === 200 && cmd.body?.success === true, `console list → ${cmd.status}: ${cmd.text.slice(0, 200)}`);
    return `query online (max ${query.body?.maxplayers}), console answers`;
  });

  // ---- Server B: LAN-only honesty ----
  await timed("joininfo/lan-honesty", async () => {
    expect(!!mcDef && !!extra.lanIp, "needs the Minecraft definition + a LAN IPv4");
    const serverB = await createServer(currentCookie, "WinSmoke LAN", mcDef.id, { enableUpnp: false });
    bootTimes.vanillaLanMs = await startAndWaitRunning(currentCookie, serverB.id, "WinSmoke LAN", MC_BOOT_TIMEOUT_MS);
    try {
      const conn = await api("GET", `/api/servers/${serverB.id}/connectivity`, { cookie: currentCookie });
      expect(conn.status === 200, `connectivity → ${conn.status}`);
      expect(conn.body?.invite?.addressPath === "lan", `addressPath → ${conn.body?.invite?.addressPath}, want "lan"`);
      expect(
        conn.body?.invite?.address === `${extra.lanIp}:${serverB.port}`,
        `invite address → ${conn.body?.invite?.address}, want ${extra.lanIp}:${serverB.port}`
      );
      const router = conn.body?.report?.checks?.find((c) => c.id === "router");
      expect(router?.status === "fail", `LAN-only router check should fail honestly, got ${router?.status}`);
      extra.joinInfoLan = conn.body?.invite?.address;
      return `address ${conn.body.invite.address} via "lan" (no UPnP — honest)`;
    } finally {
      await stopAndWaitStopped(currentCookie, serverB.id).catch((e) => log(`serverB stop: ${e.message}`));
    }
  });

  // ---- Tunnel on real Windows/network (needs an agent secret) ----
  const playitSecret = args["playit-secret"] || process.env.PLAYIT_AGENT_SECRET || readRealPlayitSecret();
  if (playitSecret && wanted("tunnel/")) {
    await timed("tunnel/start-through-relay", async () => {
      expect(!!serverA, "UPnP server did not boot");
      fs.mkdirSync(path.join(launched.userDataDir, "playit", serverA.id), { recursive: true });
      fs.writeFileSync(path.join(launched.userDataDir, "playit", serverA.id, "playit.toml"), `secret_key = "${playitSecret}"\n`, { mode: 0o600 });
      const toggle = await api("POST", `/api/servers/${serverA.id}/settings`, {
        cookie: currentCookie,
        body: { action: "TOGGLE_TUNNEL", enable: true },
      });
      expect(toggle.status === 200 && toggle.body?.success === true, `TOGGLE_TUNNEL → ${toggle.status}: ${toggle.text.slice(0, 300)}`);
      const url = await poll("tunnel displayAddress", TUNNEL_TIMEOUT_MS, async () => {
        const conn = await api("GET", `/api/servers/${serverA.id}/connectivity`, { cookie: currentCookie });
        return conn.body?.tunnel?.url || null;
      });
      const parsed = parseHostPort(String(url));
      expect(!!parsed, `tunnel address not host:port — "${url}"`);
      const latency = await tcpLatencyMs(parsed.host, parsed.port);
      expect(await tcpAccepts(parsed.host, parsed.port, 8000), `relay address ${url} refused TCP`);
      const conn = await api("GET", `/api/servers/${serverA.id}/connectivity`, { cookie: currentCookie });
      expect(conn.body?.invite?.addressPath === "tunnel", `addressPath with live tunnel → ${conn.body?.invite?.addressPath}, want "tunnel"`);
      extra.tunnel = { address: url, relayLatencyMs: latency };
      return `${url} accepts TCP (relay ~${latency ?? "?"}ms); addressPath "tunnel"`;
    });

    await timed("tunnel/cleanup-on-disable", async () => {
      const toggle = await api("POST", `/api/servers/${serverA.id}/settings`, {
        cookie: currentCookie,
        body: { action: "TOGGLE_TUNNEL", enable: false },
      });
      expect(toggle.status === 200, `TOGGLE_TUNNEL off → ${toggle.status}`);
      await poll("tunnel url cleared", 30_000, async () => {
        const conn = await api("GET", `/api/servers/${serverA.id}/connectivity`, { cookie: currentCookie });
        return conn.body?.tunnel?.url ? null : true;
      });
      return "connectivity url cleared";
    });
  } else {
    check(
      "tunnel/start-through-relay",
      "skip",
      "no playit agent secret — pass --playit-secret <key> (from your playit.gg account) to enable the real-network tunnel proof"
    );
    check("tunnel/cleanup-on-disable", "skip", "depends on tunnel start");
  }

  // ---- Mapping released on stop (router truth) ----
  await timed("upnp/mapping-released", async () => {
    expect(!!serverA, "UPnP server did not boot");
    await stopAndWaitStopped(currentCookie, serverA.id);
    expect(!(await tcpAccepts("127.0.0.1", serverA.port)), `port ${serverA.port} still accepts after stop`);
    if (!upnpDiscovered) {
      check("upnp/mapping-released", "skip", `no gateway answered discovery (${upnpEpDetail}) — port closure asserted above`);
      return;
    }
    const tcp = await upnpMappingState(currentUpnpEndpoint, serverA.port, "TCP");
    const udp = await upnpMappingState(currentUpnpEndpoint, serverA.port, "UDP");
    expect(tcp !== "present", `router STILL reports the TCP ${serverA.port} mapping after stop (${upnpEpDetail})`);
    return `router mapping gone (TCP ${tcp}, UDP ${udp}) — ${upnpEpDetail}`;
  });

  // ---- ATM10: the owed pipeline, on real hardware ----
  await timed("pack/atm10-pipeline", async () => {
    expect(!!mcDef, "no Minecraft definition (auth checks failed)");
    const serverC = await createServer(currentCookie, "WinSmoke ATM10", mcDef.id, { enableUpnp: false, ramGB: PACK_RAM_GB });
    bootTimes.vanillaPackMs = await startAndWaitRunning(currentCookie, serverC.id, "WinSmoke ATM10 (vanilla first)", MC_BOOT_TIMEOUT_MS);
    await stopAndWaitStopped(currentCookie, serverC.id);

    let provider = "curseforge";
    let projectId = args["pack-id"] || "";
    if (!projectId) {
      const search = await api(
        "GET",
        `/api/servers/${serverC.id}/mods/search?q=${encodeURIComponent(PACK_QUERY)}&type=modpacks`,
        { cookie: currentCookie }
      );
      expect(search.status === 200, `pack search → ${search.status}: ${search.text.slice(0, 200)}`);
      const hit = (search.body?.results ?? []).find((r) => r.provider === "curseforge" && PACK_QUERY_RE.test(r.name ?? ""));
      expect(!!hit, `no CurseForge pack matching /${PACK_QUERY_RE.source}/ in the live search (set --pack-id to override)`);
      projectId = hit.packageId;
    }
    const installId = `winsmoke-atm10-${Date.now()}`;
    log(`installing ${provider}:${projectId} (${PACK_RAM_GB}GB RAM server) — the download is large, this takes minutes…`);
    const install = await api("POST", `/api/servers/${serverC.id}/mods/install-pack`, {
      cookie: currentCookie,
      body: { provider, projectId, installId },
      timeoutMs: 45 * 60_000,
    });
    expect(install.status === 200, `install-pack → ${install.status}: ${install.text.slice(0, 400)}`);
    expect(/client-only skipped/i.test(install.body?.message ?? ""), `pack message must report exclusions → ${String(install.body?.message).slice(0, 200)}`);
    expect((install.body?.warnings ?? []).length >= 1, "warnings must carry the boot-test runtime line");
    const loader = await api("GET", `/api/servers/${serverC.id}/mods/loader`, { cookie: currentCookie });
    expect(!!loader.body?.loader?.type, `pack must provision a loader → ${loader.text.slice(0, 200)}`);
    const mods = await api("GET", `/api/servers/${serverC.id}/mods`, { cookie: currentCookie });
    const modRows = (mods.body?.mods ?? []).length;
    expect(modRows >= 15, `pack install must produce real mod rows (${modRows})`);
    const jars = fs.existsSync(modsDir(serverC.id)) ? fs.readdirSync(modsDir(serverC.id)).filter((f) => f.endsWith(".jar")) : [];
    expect(jars.length >= 15, `pack jars on disk (${jars.length})`);

    bootTimes.atm10Ms = await startAndWaitRunning(currentCookie, serverC.id, "WinSmoke ATM10 (packed)", PACK_BOOT_TIMEOUT_MS);
    const query = await poll("ATM10 query online", 120_000, async () => {
      const r = await api("GET", `/api/servers/${serverC.id}/query`, { cookie: currentCookie });
      return r.status === 200 && r.body?.status === "online" ? r : null;
    });
    await stopAndWaitStopped(currentCookie, serverC.id);
    extra.atm10 = {
      projectId,
      loader: loader.body.loader.type,
      modRows,
      jarCount: jars.length,
      bootMs: bootTimes.atm10Ms,
      queryOnline: query.body?.status,
    };
    return `${loader.body.loader.type} server, ${modRows} mods, RUNNING in ${Math.round(bootTimes.atm10Ms / 1000)}s, query ${query.body?.status}`;
  });

  // ---- Retire-replaced + locked-jar quarantine (Adrenaline, deterministic pins) ----
  let serverD = null;
  await timed("pack/retire-replaced-mods", async () => {
    expect(!!mcDef, "no Minecraft definition (auth checks failed)");
    serverD = await createServer(currentCookie, "WinSmoke Retire", mcDef.id, { enableUpnp: false, ramGB: 6 });
    bootTimes.vanillaRetireMs = await startAndWaitRunning(currentCookie, serverD.id, "WinSmoke Retire (vanilla first)", MC_BOOT_TIMEOUT_MS);
    await stopAndWaitStopped(currentCookie, serverD.id);

    const install = await api("POST", `/api/servers/${serverD.id}/mods/install-pack`, {
      cookie: currentCookie,
      body: { provider: "modrinth", projectId: RETIRE_PACK_PROJECT, versionId: RETIRE_PACK_VERSION, installId: `winsmoke-retire-${Date.now()}` },
      timeoutMs: 20 * 60_000,
    });
    expect(install.status === 200, `Adrenaline install-pack → ${install.status}: ${install.text.slice(0, 400)}`);
    const modsBefore = (await api("GET", `/api/servers/${serverD.id}/mods`, { cookie: currentCookie })).body?.mods ?? [];
    expect(modsBefore.length >= 5, `Adrenaline rows (${modsBefore.length}) too few to retire against`);

    const older = await downloadOlderAdrenaline();
    const mp = multipartBody("modpack", { filename: "adrenaline-older.mrpack", data: older }, { installId: `winsmoke-reimp-${Date.now()}` });
    const reimport = await api("POST", `/api/servers/${serverD.id}/mods/import-modpack`, {
      cookie: currentCookie,
      body: mp.body,
      headers: { "content-type": mp.contentType },
      timeoutMs: 20 * 60_000,
    });
    expect(reimport.status === 200, `older-version import → ${reimport.status}: ${reimport.text.slice(0, 400)}`);
    const warnings = reimport.body?.warnings ?? [];
    expect(
      warnings.some((w) => /from the previous pack install/.test(w)),
      `retirement warning missing → ${JSON.stringify(warnings).slice(0, 300)}`
    );
    const modsAfter = (await api("GET", `/api/servers/${serverD.id}/mods`, { cookie: currentCookie })).body?.mods ?? [];
    expect(modsAfter.length < modsBefore.length, `retired mods should shrink rows: ${modsBefore.length} → ${modsAfter.length}`);
    extra.retire = { before: modsBefore.length, after: modsAfter.length };
    extra.retireServerId = serverD.id;
    return `${modsBefore.length} → ${modsAfter.length} rows across the downgrade`;
  });

  await timed("pack/locked-jar-quarantine", async () => {
    expect(!!serverD, "retire server did not materialize (previous check failed)");
    const bombPath = path.join(modsDir(serverD.id), BOMB_JAR_NAME);
    fs.mkdirSync(modsDir(serverD.id), { recursive: true });
    fs.writeFileSync(bombPath, makeBombJar());

    // Hold the jar the way a Windows AV scanner does — an open handle with
    // sharing mode NONE. Node's own fs.open shares everything, which would
    // NOT reproduce the lock, so the lock is held by PowerShell.
    const lockChild = spawn(
      "powershell",
      ["-NoProfile", "-Command", `$f=[System.IO.File]::Open('${bombPath.replace(/'/g, "''")}','Open','Read','None'); Start-Sleep -Seconds 90; $f.Close()`],
      { windowsHide: true, stdio: "ignore" }
    );
    log("holding a no-share handle on the bomb jar (AV-lock semantics) for 90s…");
    try {
      const attempt = await api("POST", `/api/servers/${serverD.id}/mods/install`, {
        cookie: currentCookie,
        body: { modType: "MODRINTH", modId: CARPET_MOD_PROJECT, installId: `winsmoke-lock-${Date.now()}` },
        timeoutMs: 15 * 60_000,
      });
      expect(attempt.status >= 400, `install with a locked bomb jar must fail honestly, got ${attempt.status}`);
      expect(/rollback|failed/i.test(attempt.body?.error ?? ""), `failure should name the rollback → ${String(attempt.body?.error).slice(0, 200)}`);
      // The quarantine's per-jar warnings are internal to the failure path;
      // the contract is: honest failure, no hang, no partial install.
      const alive = await api("GET", "/api/servers", { cookie: currentCookie });
      expect(alive.status === 200, "app must still serve after the lock failure");
    } finally {
      // release before the recovery attempt
      try {
        lockChild.kill();
      } catch {
        /* already exited */
      }
      await sleep(1500);
    }

    // Recovery — the exact guidance the honest failure gives the user.
    const retry = await api("POST", `/api/servers/${serverD.id}/mods/install`, {
      cookie: currentCookie,
      body: { modType: "MODRINTH", modId: CARPET_MOD_PROJECT, installId: `winsmoke-recover-${Date.now()}` },
      timeoutMs: 15 * 60_000,
    });
    expect(retry.status === 200, `recovery install → ${retry.status}: ${retry.text.slice(0, 400)}`);
    const warnings = retry.body?.warnings ?? [];
    expect(
      warnings.some((w) => w.includes(BOMB_JAR_NAME)),
      `quarantine warning for the bomb jar missing → ${JSON.stringify(warnings).slice(0, 400)}`
    );
    expect(!fs.existsSync(bombPath), "the bomb jar must be gone after quarantine");
    const rows = (await api("GET", `/api/servers/${serverD.id}/mods`, { cookie: currentCookie })).body?.mods ?? [];
    expect(rows.some((m) => m.packageId === CARPET_MOD_PROJECT), "the real mod must survive the quarantine round-trip");
    return "locked jar → honest rollback; released → quarantined + real mod installed";
  });

  // ---- Auto-update on real hardware (last — it restarts the app) ----
  await runAutoUpdateChecks(exePath);

  printSummary();
  return writeReport(extra);
}

/** Read-only: reuse the REAL playit agent identity from the default install
 *  (never written to) so the tunnel test runs on the user's real account. */
function readRealPlayitSecret() {
  try {
    const dir = path.join(defaultUserDataDir(), "playit");
    for (const entry of fs.readdirSync(dir)) {
      const toml = readFileOrEmpty(path.join(dir, entry, "playit.toml"));
      const m = /secret_key\s*=\s*"([^"]+)"/.exec(toml);
      if (m) return m[1];
    }
  } catch {
    /* no playit config on this machine */
  }
  return "";
}

async function downloadOlderAdrenaline() {
  const meta = await request("GET", `https://api.modrinth.com/v2/version/${RETIRE_PACK_OLDER_VERSION}`, { timeoutMs: 30_000 });
  expect(meta.status === 200 && meta.json?.files?.length, `Modrinth version lookup → ${meta.status}`);
  const url = meta.json.files.find((f) => f.primary)?.url || meta.json.files[0].url;
  const dest = path.join(os.tmpdir(), `winsmoke-adrenaline-${RETIRE_PACK_OLDER_VERSION}.mrpack`);
  await downloadToFile(url, dest);
  const buf = fs.readFileSync(dest);
  expect(buf.length > 10_000, `older mrpack too small (${buf.length}B)`);
  return buf;
}

async function runAutoUpdateChecks(exePath) {
  let latest = null;
  let installed = null;
  await timed("autoupdate/version-vs-latest", async () => {
    installed = normVersion(exeProductVersion(exePath));
    const rel = await request("GET", "https://api.github.com/repos/RealmSwap/RealmSwap/releases/latest", {
      headers: { "User-Agent": "realmswap-win-smoke", Accept: "application/vnd.github+json" },
      timeoutMs: 15_000,
    });
    expect(rel.status === 200 && rel.json?.tag_name, `GitHub Latest lookup → ${rel.status}`);
    latest = normVersion(rel.json.tag_name);
    extra.update = { installed, latest };
    if (installed === latest) return `installed ${installed} IS Latest — negative proof follows`;
    return `installed ${installed} < Latest ${latest} — exercising the real update path`;
  });
  if (!latest || !wanted("autoupdate/")) return;

  const pendingDir = findUpdaterPendingDir(exePath);
  const stagedInstaller = () => {
    try {
      if (!fs.existsSync(pendingDir)) return null;
      for (const f of fs.readdirSync(pendingDir)) {
        // electron-updater downloads into temp-* then renames — only the
        // final artifact name is a completed download.
        if (!/^realmswap-setup.*\.exe$/i.test(f) || /^temp-/i.test(f)) continue;
        const p = path.join(pendingDir, f);
        if (fs.statSync(p).size <= 50 * 1024 * 1024) return null;
        return p;
      }
    } catch {
      /* dir gone mid-check */
    }
    return null;
  };

  if (installed === latest) {
    await timed("autoupdate/up-to-date-negative-proof", async () => {
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const staged = stagedInstaller();
        expect(!staged, `an unexpected staged installer appeared at ${staged} while up to date`);
        await sleep(5000);
      }
      return `no staged download in 90s while at ${latest} — the updater's check ran clean`;
    });
    return;
  }

  let staged = null;
  await timed("autoupdate/staged-download", async () => {
    log(`waiting for electron-updater to stage ${latest} (large download)…`);
    staged = await poll("staged update installer", UPDATE_STAGE_TIMEOUT_MS, async () => {
      const found = stagedInstaller();
      if (!found) return null;
      const size = fs.statSync(found).size;
      await sleep(2000); // stability: still growing?
      if (fs.statSync(found).size !== size) return null;
      return found;
    });
    return path.basename(staged);
  });

  await timed("autoupdate/apply-and-relaunch-at-latest", async () => {
    expect(!!staged && fs.existsSync(staged), "staged installer vanished before apply");
    const stagedVersion = normVersion(exeProductVersion(staged));
    expect(stagedVersion === latest, `staged installer version ${stagedVersion} ≠ Latest ${latest}`);
    // Close-to-tray makes WM_CLOSE a hide, so the on-quit install can't be
    // triggered from outside; the staged installer is applied silently — the
    // same NSIS payload autoInstallOnAppQuit would run (unit-tested in
    // electron/__tests__/autoUpdate.test.js, exercised end-to-end in CI #203).
    await stopApp();
    const res = spawnSync(staged, ["/S"], { windowsHide: true, timeout: 10 * 60_000 });
    expect(res.status === 0, `staged installer exited ${res.status}`);
    const exeNow = locateInstalledExe(exePath);
    const versionNow = normVersion(exeProductVersion(exeNow));
    expect(versionNow === latest, `installed version after update ${versionNow} ≠ Latest ${latest}`);
    launchApp(exeNow, launched.userDataDir, currentJwtSecret);
    await waitServerReady();
    expect(readStartupLog().includes("migrations applied:"), "updated app startup.log missing 'migrations applied:'");
    const res2 = await api("GET", "/api/servers", { cookie: currentCookie });
    expect(res2.status === 200, `updated app must serve the minted session → ${res2.status}`);
    extra.installedVersion = versionNow;
    return `now ${versionNow}, serving on ${launched.port}`;
  });
}

/** electron-updater's cache dir comes from app-update.yml (updaterCacheDirName). */
function findUpdaterPendingDir(installedExe) {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  try {
    const yml = fs.readFileSync(path.join(path.dirname(installedExe), "resources", "app-update.yml"), "utf8");
    const m = /updaterCacheDirName:\s*(\S+)/.exec(yml);
    if (m) return path.join(localAppData, m[1], "pending");
  } catch {
    /* fall through to glob */
  }
  try {
    for (const entry of fs.readdirSync(localAppData)) {
      if (entry.toLowerCase().includes("realmswap") && entry.endsWith("-updater")) {
        return path.join(localAppData, entry, "pending");
      }
    }
  } catch {
    /* no LOCALAPPDATA */
  }
  return path.join(localAppData, "realmswap-updater", "pending");
}

// ---------------------------------------------------------------------------
// Cleanup — best-effort, runs in every exit path
// ---------------------------------------------------------------------------

async function cleanup() {
  // Stop any server still RUNNING so stop handlers release UPnP mappings.
  if (launched?.port && currentCookie) {
    try {
      const list = await api("GET", "/api/servers", { cookie: currentCookie, timeoutMs: 5000 });
      for (const s of list.body?.servers ?? []) {
        if (s.status === "RUNNING" || s.status === "STARTING") {
          await api("POST", `/api/servers/${s.id}/stop`, { cookie: currentCookie, timeoutMs: 10_000 }).catch(() => {});
        }
      }
    } catch {
      /* app may already be down */
    }
  }
  // Safety net: delete any UPnP mapping this run may have left.
  try {
    if (currentUpnpEndpoint) {
      for (const port of upnpTouchedPorts) {
        await upnpDeleteMapping(currentUpnpEndpoint, port, "TCP");
        await upnpDeleteMapping(currentUpnpEndpoint, port, "UDP");
      }
    }
  } catch {
    /* best effort */
  }
  await stopApp();
  if (launched?.userDataDir && !args.keep) {
    try {
      fs.rmSync(launched.userDataDir, { recursive: true, force: true });
      log(`throwaway data dir removed: ${launched.userDataDir}`);
    } catch (err) {
      log(`could not remove throwaway dir (harmless; --keep preserves it anyway): ${launched.userDataDir} — ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------

async function main() {
  if (args.selftest) {
    const failed = await runSelftest();
    return failed > 0 ? 1 : 0;
  }
  if (process.platform !== "win32") {
    console.error("[win-smoke] this harness drives the installed Windows app — run it on the PC.");
    console.error("[win-smoke] pure-logic checks run anywhere:  node scripts/win-smoke.mjs --selftest");
    return 2;
  }

  try {
    return await runPcSmoke();
  } catch (err) {
    console.error(`[win-smoke] fatal: ${err?.stack || err}`);
    check("run/completed", "fail", err?.message ?? String(err));
    printSummary();
    writeReport({ ...extra, fatal: err?.message ?? String(err) });
    return 1;
  } finally {
    await cleanup();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[win-smoke] fatal: ${err?.stack || err}`);
    process.exit(1);
  });
