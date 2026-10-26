import { execFile } from "child_process";
import * as fs from "fs";

/**
 * What is actually bound to local ports, straight from the OS. The
 * connectivity troubleshooter used to answer "is the game listening?" with
 * a TCP connect to 127.0.0.1:<port>, which can never see a UDP-only game
 * (Enshrouded, Valheim, Rust, Palworld…) — those read as "nothing is
 * listening" while players were in. Every platform can list its sockets;
 * the parsers here are pure so the formats are pinned by tests.
 */

export type BoundProtocol = "TCP" | "UDP";

export interface BoundSocket {
  protocol: BoundProtocol;
  port: number;
  pid?: number;
}

export interface BoundPortsDeps {
  platform?: NodeJS.Platform;
  exec?: (cmd: string, args: string[]) => Promise<string>;
  readFile?: (path: string) => Promise<string>;
}

const EXEC_TIMEOUT_MS = 5_000;

/** Port of an `addr:port` endpoint, or null when it has none (`*:*`). */
function portOf(endpoint: string | undefined): number | null {
  if (!endpoint) return null;
  const idx = endpoint.lastIndexOf(":");
  if (idx < 0) return null;
  const n = Number(endpoint.slice(idx + 1));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function pidOf(token: string | undefined): number | undefined {
  const n = Number(token);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * `netstat -ano` (Windows). TCP rows count only while listening, detected by
 * the all-zero foreign endpoint rather than the State word, which Windows
 * localizes ("LISTENING" / "ABHÖREN" / …). UDP has no state: every row is a
 * bound socket.
 */
export function parseWindowsNetstat(output: string): BoundSocket[] {
  const sockets: BoundSocket[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    const proto = parts[0]?.toUpperCase();
    if (proto !== "TCP" && proto !== "UDP") continue;
    const port = portOf(parts[1]);
    if (port === null) continue;
    if (proto === "TCP") {
      if (portOf(parts[2]) !== 0) continue;
      sockets.push({ protocol: "TCP", port, pid: pidOf(parts[4]) });
    } else {
      sockets.push({ protocol: "UDP", port, pid: pidOf(parts[3]) });
    }
  }
  return sockets;
}

/**
 * `lsof -nP -iTCP -sTCP:LISTEN` / `lsof -nP -iUDP` (macOS). The NODE column
 * names the protocol and the NAME column the endpoint; a connected UDP
 * socket shows `local->peer`, of which only the local side matters.
 */
export function parseLsof(output: string): BoundSocket[] {
  const sockets: BoundSocket[] = [];
  for (const raw of output.split("\n")) {
    const parts = raw.trim().split(/\s+/);
    const nodeIdx = parts.findIndex((p, i) => i >= 4 && (p === "TCP" || p === "UDP"));
    if (nodeIdx < 0) continue;
    const protocol = parts[nodeIdx] as BoundProtocol;
    if (protocol === "TCP" && !raw.includes("(LISTEN)")) continue;
    const port = portOf((parts[nodeIdx + 1] ?? "").split("->")[0]);
    if (port === null) continue;
    sockets.push({ protocol, port, pid: pidOf(parts[1]) });
  }
  return sockets;
}

/**
 * `/proc/net/{tcp,tcp6,udp,udp6}` (Linux): `local_address` is hex
 * `ADDR:PORT`; TCP rows count only in state 0A (LISTEN). No pid without
 * walking every process's fd table, so none is reported.
 */
export function parseProcNet(content: string, protocol: BoundProtocol): BoundSocket[] {
  const sockets: BoundSocket[] = [];
  for (const raw of content.split("\n").slice(1)) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 4) continue;
    if (protocol === "TCP" && parts[3] !== "0A") continue;
    const local = parts[1];
    const port = parseInt(local.slice(local.lastIndexOf(":") + 1), 16);
    if (!Number.isInteger(port)) continue;
    sockets.push({ protocol, port });
  }
  return sockets;
}

function defaultExec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        // lsof exits 1 when nothing matched its filter — an empty answer,
        // not a failure. (execFile reports exit codes as numbers, spawn
        // failures as string codes like ENOENT.)
        const code = (err as { code?: unknown } | null)?.code;
        if (err && !(cmd === "lsof" && code === 1)) {
          reject(err);
          return;
        }
        resolve(stdout?.toString() ?? "");
      },
    );
  });
}

/**
 * Every TCP listener and UDP socket bound on this machine, or null when the
 * host offers no way to ask (unsupported platform, tool missing, command
 * failed). Null must stay distinct from an empty list: "can't tell" is not
 * "nothing is bound".
 */
export async function listBoundSockets(deps: BoundPortsDeps = {}): Promise<BoundSocket[] | null> {
  const platform = deps.platform ?? process.platform;
  const exec = deps.exec ?? defaultExec;
  const readFile = deps.readFile ?? ((p: string) => fs.promises.readFile(p, "utf8"));
  try {
    if (platform === "win32") {
      return parseWindowsNetstat(await exec("netstat", ["-ano"]));
    }
    if (platform === "darwin") {
      const [tcp, udp] = await Promise.all([
        exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"]),
        exec("lsof", ["-nP", "-iUDP"]),
      ]);
      return [...parseLsof(tcp), ...parseLsof(udp)];
    }
    if (platform === "linux") {
      const tables: Array<[string, BoundProtocol]> = [
        ["/proc/net/tcp", "TCP"], ["/proc/net/tcp6", "TCP"],
        ["/proc/net/udp", "UDP"], ["/proc/net/udp6", "UDP"],
      ];
      const reads = await Promise.all(tables.map(([p]) => readFile(p).then((c) => c, () => null)));
      if (reads.every((c) => c === null)) return null;
      return tables.flatMap(([, protocol], i) => (reads[i] === null ? [] : parseProcNet(reads[i] as string, protocol)));
    }
    return null;
  } catch {
    return null;
  }
}
