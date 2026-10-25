import { execFile, spawn, type ChildProcessWithoutNullStreams } from "child_process";
import type { InstallPlan, PortPlan } from "../../definitions/plan";
import type { ProcessStats } from "../types";

/** Quote a single shell token for a `bash -lc` command line. Safe tokens
 *  (letters, digits, and a small set of punctuation) are returned as-is. */
export function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./:=+\-]+$/.test(s)) return s;
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

/** Exec line for the server process: install-dir binaries get the explicit
 *  ./ prefix; PATH commands (e.g. "java", "bash") are exec'd by name. */
function buildExecLine(executable: string, args: string[], executableOnPath?: boolean): string {
  const quoted = args.map(shellQuote).join(" ");
  const exe = executableOnPath ? executable : `./${executable}`;
  return quoted ? `exec ${exe} ${quoted}` : `exec ${exe}`;
}

/** Shell command run as the container entrypoint: SteamCMD install/validate,
 *  then exec the server binary from the install dir. */
export function buildStartEntrypoint(
  appId: string,
  installSubDir: string,
  executable: string,
  args: string[],
): string {
  const execLine = buildExecLine(executable, args);
  // Resolve the SteamCMD launcher portably: SteamCMD base images (e.g.
  // cm2network/steamcmd) ship it at $STEAMCMDDIR/steamcmd.sh and do NOT put a
  // `steamcmd` command on PATH; fall back to a PATH `steamcmd` for images that do.
  const resolve = `steamcmd_bin="\${STEAMCMDDIR:+\$STEAMCMDDIR/steamcmd.sh}"; steamcmd_bin="\${steamcmd_bin:-steamcmd}"`;
  // A fresh container has a cold app-metadata cache, so the first app_update can fail
  // with "Missing configuration" (exit 8). +app_info_update 1 warms the cache, and we
  // retry up to 3 times — mirroring LocalWindowsRunner's SteamCMD handling.
  const update =
    `"\$steamcmd_bin" +force_install_dir /data/${installSubDir} +login anonymous` +
    ` +app_info_update 1 +app_update ${appId} validate +quit`;
  const installWithRetry =
    `n=0; until ${update}; do n=\$((n+1)); ` +
    `[ "\$n" -ge 3 ] && echo "SteamCMD failed after \$n attempts" && exit 1; ` +
    `echo "SteamCMD retry \$n (cold cache)"; sleep 5; done`;
  return `${resolve}; ${installWithRetry} && cd /data/${installSubDir} && ${execLine}`;
}

/** Shell command run as the container entrypoint for DOWNLOAD installs (e.g.
 *  Minecraft): fetch the file if missing, then exec the server. The download
 *  tool is resolved defensively because minimal runtime images ship without
 *  one — eclipse-temurin JRE images purge curl AND wget, so the last resort
 *  apt-installs curl (Ubuntu-based images run as root). Only the first boot
 *  pays that cost; the existence check makes later starts instant. */
export function buildDownloadStartEntrypoint(o: {
  url: string;
  fileName: string;
  installSubDir: string;
  executable: string;
  args: string[];
  executableOnPath?: boolean;
}): string {
  const cd = o.installSubDir ? `cd /data/${o.installSubDir}` : "cd /data";
  const fetch =
    `if [ ! -f ${shellQuote(o.fileName)} ]; then ` +
    `fetch=""; command -v curl >/dev/null 2>&1 && fetch="curl -fsSL -o"; ` +
    `if [ -z "\$fetch" ] && command -v wget >/dev/null 2>&1; then fetch="wget -q -O"; fi; ` +
    `if [ -z "\$fetch" ]; then (apt-get update -qq && apt-get install -y -qq curl >/dev/null 2>&1) && fetch="curl -fsSL -o"; fi; ` +
    `if [ -z "\$fetch" ]; then echo "No download tool available in image" >&2; exit 1; fi; ` +
    `\$fetch ${shellQuote(o.fileName)} ${shellQuote(o.url)} || { echo "Download failed" >&2; exit 1; }; ` +
    `fi`;
  return `${cd} && ${fetch} && ${buildExecLine(o.executable, o.args, o.executableOnPath)}`;
}

/** Entrypoint for any container plan, dispatching on the install method.
 *  DockerRunner and the agent payload builder both go through here so the
 *  two runtimes cannot drift. CUSTOM_SCRIPT has no container story yet. */
export function buildContainerStartEntrypoint(
  installPlan: InstallPlan,
  container: { installSubDir: string; executable: string; args: string[]; executableOnPath?: boolean },
): string {
  if (installPlan.method === "STEAMCMD" && installPlan.appId) {
    return buildStartEntrypoint(
      installPlan.appId, container.installSubDir, container.executable, container.args,
    );
  }
  if (installPlan.method === "DOWNLOAD" && installPlan.url && installPlan.fileName) {
    return buildDownloadStartEntrypoint({
      url: installPlan.url,
      fileName: installPlan.fileName,
      installSubDir: container.installSubDir,
      executable: container.executable,
      args: container.args,
      executableOnPath: container.executableOnPath,
    });
  }
  throw new Error(`Unsupported container install method: ${installPlan.method}`);
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

export type DockerResult = { code: number | null; stdout: string; stderr: string };

/** Environment passed to every docker invocation. Passing process.env through
 *  means DOCKER_HOST / DOCKER_CONTEXT / DOCKER_TLS_VERIFY / DOCKER_CERT_PATH are
 *  honored — this is the single seam for targeting a remote daemon later. */
function dockerEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
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
