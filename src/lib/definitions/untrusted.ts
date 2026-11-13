import { z } from "zod";
import type { GameDefinitionSpec } from "./types";
import { KNOWN_FIXED_VARS, isUnsafePath, validateSpec } from "./validate";
import { DEFAULT_STEAMCMD_IMAGE } from "./plan";

/**
 * The gate every game definition written by SOMEONE ELSE passes through
 * before it can become a row the runners execute: a marketplace realm's
 * custom_def_spec (at publish and again at deploy — the cloud row can be
 * written without going through this app) and definition files imported
 * from disk.
 *
 * A definition names the program a server start spawns, so no amount of
 * validation makes one "safe" — whether to run a stranger's game server is
 * the deployer's call. What this gate guarantees is that the call is an
 * informed one: the consent summary is everything that runs. That means no
 * scripts, no PATH lookups (so no cmd.exe / powershell.exe), nothing outside
 * the server's own folder, no environment variables that redirect what a
 * process loads, and downloads only from the allowlisted hosts.
 *
 * Definitions that need more than this (a script, a PATH tool, a custom
 * container image) are not marketplace content — they ship as built-ins,
 * reviewed in a pull request.
 */

export const TRUSTED_DOWNLOAD_HOSTS = [
  "github.com",
  "githubusercontent.com",
  "thunderstore.io",
  "curseforge.com",
  "steamcdn-a.akamaihd.net",
] as const;

const MAX_SPEC_BYTES = 64 * 1024;

/** Files a definition may write into the server folder: configuration, never code. */
const CONFIG_EXTENSIONS = new Set([
  "", ".json", ".ini", ".cfg", ".txt", ".xml", ".yml", ".yaml", ".properties", ".toml", ".conf",
]);

/**
 * Variables that change WHICH code a process loads rather than how the game
 * behaves. The runner merges a definition's env over the dashboard's own, so
 * any of these would turn "runs the game's server binary" into "runs whatever
 * this points at".
 */
const FORBIDDEN_ENV = new Set([
  "PATH", "PATHEXT", "COMSPEC", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA",
  "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH", "PROGRAMDATA", "PROGRAMFILES",
  "JAVA_HOME", "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH",
  "NODE_OPTIONS", "NODE_PATH", "PYTHONPATH", "PYTHONSTARTUP", "PYTHONHOME", "PERL5OPT", "PERL5LIB",
  "RUBYOPT", "RUBYLIB", "BASH_ENV", "ENV", "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "DOTNET_STARTUP_HOOKS", "DOTNET_ROOT",
  "COR_PROFILER", "COR_ENABLE_PROFILING", "CORECLR_PROFILER", "CORECLR_ENABLE_PROFILING",
  "__COMPAT_LAYER", "__PROTO__", "CONSTRUCTOR", "PROTOTYPE",
]);

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const PORT_VALUE = /^(\d{1,5}|\{[A-Za-z][A-Za-z0-9_]{0,39}\})$/;
const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * Stricter than validate.ts's isUnsafePath, which only has to stop traversal
 * in definitions their own author wrote: also refuses drive-relative and
 * alternate-stream forms ("C:evil", "file.txt:stream") and Windows device
 * names, none of which a real game definition needs.
 */
export function isSafeRelativePath(p: string): boolean {
  if (!p || p.length > 260 || CONTROL_CHARS.test(p)) return false;
  if (isUnsafePath(p) || p.includes(":")) return false;
  return !p.split(/[\\/]/).some((seg) => WINDOWS_DEVICE_NAME.test(seg.replace(/\..*$/, "")));
}

/**
 * readyPattern / stdoutPatterns run against live server output on the
 * dashboard's own event loop, so a pattern with catastrophic backtracking
 * would freeze every server's console, not just this one's. Refuses the
 * shape that causes it: a quantified group whose body is itself quantified.
 */
export function unsafeRegexReason(src: string): string | null {
  if (src.length > 200) return "is longer than 200 characters";
  try {
    new RegExp(src);
  } catch {
    return "is not a valid regular expression";
  }
  let s = src.replace(/\\./g, "x").replace(/\[[^\]]*\]/g, "x");
  const quantifier = /[+*]|\{\d+(?:,\d*)?\}/;
  for (let i = 0; i < 64; i++) {
    const group = /\(([^()]*)\)([+*]|\{\d+(?:,\d*)?\})?/.exec(s);
    if (!group) return null;
    const bodyRepeats = quantifier.test(group[1]) || group[1].includes("\u0001");
    if (bodyRepeats && group[2]) return "repeats a group that already repeats (it could hang the dashboard)";
    s = s.slice(0, group.index) + (bodyRepeats ? "\u0001" : "x") + (group[2] ?? "") + s.slice(group.index + group[0].length);
  }
  return "is nested too deeply";
}

const relPath = (label: string) =>
  z.string().refine(isSafeRelativePath, {
    message: `${label} must be a relative path inside the server folder (no "..", drive letters, or absolute paths)`,
  });

const text = (max: number) => z.string().max(max).refine((s) => !s.includes("\0"), { message: "must not contain NUL bytes" });

const argSchema = z.union([
  text(2000),
  z.object({ value: z.array(text(2000)).max(20), includeWhen: z.string().regex(IDENTIFIER) }),
]);

const envSchema = z.record(
  z.string().regex(ENV_NAME, { message: "is not a valid environment variable name" }),
  text(2000),
);

const safeRegex = (label: string) =>
  z.string().superRefine((src, ctx) => {
    const reason = unsafeRegexReason(src);
    if (reason) ctx.addIssue({ code: "custom", message: `${label} ${reason}` });
  });

const specSchema = z.object({
  // Listing metadata some publishers put beside the spec; lifted out before the spec is stored.
  name: z.string().max(80).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(16).optional(),
  recommendedRamGB: z.number().min(1).max(256).optional(),

  install: z.object({
    appId: z.union([z.string(), z.number()]).optional(),
    installSubDir: relPath("install.installSubDir").optional(),
    checkFile: relPath("install.checkFile").optional(),
    requiredDiskGB: z.number().min(0).max(1000).optional(),
    url: z.string().max(2000).optional(),
    fileName: z.string().max(120).optional(),
    unzip: z.boolean().optional(),
    installScript: z.unknown().optional(),
  }),
  launch: z.object({
    executable: z.string().min(1).max(260),
    args: z.array(argSchema).max(100).default([]),
    cwdSubDir: relPath("launch.cwdSubDir").optional(),
    env: envSchema.optional(),
    stdoutPatterns: z.array(z.object({
      regex: safeRegex("stdout pattern"),
      updateField: z.literal("ipAddress"),
      transform: z.literal("joinCode").optional(),
    })).max(10).optional(),
    stdinStopCommand: text(200).optional(),
    rconStopCommand: text(200).optional(),
    launchScript: z.unknown().optional(),
    executableOnPath: z.boolean().optional(),
    preLaunchDirs: z.array(relPath("launch.preLaunchDirs")).max(20).optional(),
    readyPattern: safeRegex("readyPattern").optional(),
    inviteCodeFile: relPath("launch.inviteCodeFile").optional(),
  }),
  defaultPort: z.number().int().min(1).max(65535),
  params: z.array(z.object({
    key: z.string().regex(IDENTIFIER, { message: "must be a plain identifier (letters, digits, underscore)" }),
    label: z.string().max(120),
    type: z.enum(["text", "number", "boolean", "enum"]),
    default: z.union([z.string().max(2000), z.number(), z.boolean()]).optional(),
    options: z.array(z.string().max(200)).max(100).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    required: z.boolean().optional(),
    group: z.string().max(60).optional(),
    help: z.string().max(300).optional(),
  })).max(100).default([]),
  configFiles: z.array(z.object({
    path: relPath("configFiles.path"),
    strategy: z.enum(["template", "enshroudedJson", "zomboidIniMerge"]),
    template: z.string().max(MAX_SPEC_BYTES).optional(),
  })).max(50).default([]),
  editableConfigPath: relPath("editableConfigPath").optional(),
  ports: z.array(z.object({
    protocol: z.enum(["TCP", "UDP"]),
    port: z.string().regex(PORT_VALUE, { message: "must be a port number or a single {variable}" }),
  })).max(20).default([]),
  requiresJava: z.boolean().optional(),
  javaMajor: z.number().int().min(8).max(40).optional(),
  passwordPolicy: z.object({
    minLength: z.number().int().min(0).max(64).optional(),
    fallback: z.string().max(64).optional(),
  }).optional(),
  queryType: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
  queryPort: z.string().regex(PORT_VALUE).optional(),
  container: z.object({
    image: z.string().max(200).optional(),
    executable: relPath("container.executable"),
    args: z.array(argSchema).max(100).optional(),
    env: envSchema.optional(),
    installSubDir: relPath("container.installSubDir").optional(),
    executableOnPath: z.boolean().optional(),
  }).optional(),
  playerSync: z.object({
    strategy: z.enum(["minecraft_json", "valheim_txt", "rust_cfg", "command", "none"]),
    whitelistPath: relPath("playerSync.whitelistPath").optional(),
    banlistPath: relPath("playerSync.banlistPath").optional(),
    opsPath: relPath("playerSync.opsPath").optional(),
  }).optional(),
});

export type UntrustedInstallMethod = "STEAMCMD" | "DOWNLOAD";

/** Everything a deployer needs to see to decide whether to run this definition. */
export interface UntrustedDefinitionSummary {
  installMethod: UntrustedInstallMethod;
  /** Where the server's files come from: "Steam app 896660" or the download URL. */
  source: string;
  /** The program a server start runs, relative to the server folder (or RealmSwap's bundled Java). */
  executable: string;
  usesBundledJava: boolean;
  args: string[];
  envNames: string[];
  configFiles: string[];
  ports: string[];
}

export interface UntrustedDefinitionMeta {
  name?: string;
  description?: string;
  icon?: string;
  recommendedRamGB?: number;
}

export type UntrustedSpecResult =
  | { ok: true; spec: GameDefinitionSpec; installMethod: UntrustedInstallMethod; meta: UntrustedDefinitionMeta; summary: UntrustedDefinitionSummary }
  | { ok: false; errors: string[] };

function forbiddenEnvNames(env: Record<string, string> | undefined): string[] {
  return Object.keys(env ?? {}).filter((name) => FORBIDDEN_ENV.has(name.toUpperCase()));
}

function downloadUrlError(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "install.url is not a valid URL.";
  }
  if (url.protocol !== "https:") return "install.url must use https.";
  if (url.username || url.password || url.port) return "install.url must not carry credentials or a custom port.";
  const host = url.hostname.toLowerCase();
  if (!TRUSTED_DOWNLOAD_HOSTS.some((d) => host === d || host.endsWith("." + d))) {
    return `install.url host "${host}" is not on the trusted download list (${TRUSTED_DOWNLOAD_HOSTS.join(", ")}).`;
  }
  return null;
}

/**
 * Validate and normalize a definition spec of unknown provenance. On success
 * `spec` is a clean copy containing only fields this gate checked — store
 * that, never the input.
 */
export function vetUntrustedSpec(raw: unknown): UntrustedSpecResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["The game definition must be a JSON object."] };
  }
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(raw), "utf8");
  } catch {
    return { ok: false, errors: ["The game definition is not serializable JSON."] };
  }
  if (size > MAX_SPEC_BYTES) {
    return { ok: false, errors: [`The game definition is too large (${Math.round(size / 1024)} KB; the limit is ${MAX_SPEC_BYTES / 1024} KB).`] };
  }

  const parsed = specSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "definition"}: ${i.message}`),
    };
  }
  const { name, description, icon, recommendedRamGB, ...data } = parsed.data;
  const errors: string[] = [];

  // --- Install: Steam content or an allowlisted download. Never a script. ---
  const inst = data.install;
  if (inst.installScript) errors.push("Shared definitions cannot contain an install script.");
  const hasAppId = inst.appId !== undefined && String(inst.appId) !== "";
  const hasUrl = !!inst.url;
  let installMethod: UntrustedInstallMethod = "STEAMCMD";
  let install: GameDefinitionSpec["install"];
  if (hasAppId === hasUrl) {
    errors.push('install must have exactly one of "appId" (Steam) or "url" (download).');
    install = { appId: "", installSubDir: "", checkFile: "", requiredDiskGB: 0 };
  } else if (hasAppId) {
    const appId = String(inst.appId);
    // Digits only: the app id is interpolated into a steamcmd command line on remote hosts.
    if (!/^\d{1,10}$/.test(appId)) errors.push("install.appId must be a numeric Steam app id.");
    install = {
      appId,
      installSubDir: inst.installSubDir ?? "",
      checkFile: inst.checkFile ?? "",
      requiredDiskGB: inst.requiredDiskGB as number,
    };
  } else {
    installMethod = "DOWNLOAD";
    const urlError = downloadUrlError(inst.url!);
    if (urlError) errors.push(urlError);
    const fileName = inst.fileName ?? "";
    if (fileName && (/[\\/]/.test(fileName) || !isSafeRelativePath(fileName))) {
      errors.push("install.fileName must be a plain file name.");
    }
    install = {
      url: inst.url!,
      fileName,
      checkFile: inst.checkFile ?? "",
      ...(inst.installSubDir ? { installSubDir: inst.installSubDir } : {}),
      ...(inst.unzip !== undefined ? { unzip: inst.unzip } : {}),
    };
  }

  // --- Launch: a file inside the server folder, or the bundled Java. ---
  const { launchScript, ...launch } = data.launch;
  if (launchScript) errors.push("Shared definitions cannot contain a launch script.");
  // The runner swaps exactly this combination for the app-managed JRE, whatever executableOnPath says.
  const usesBundledJava = data.requiresJava === true && launch.executable === "java";
  if (!usesBundledJava) {
    if (launch.executableOnPath) {
      errors.push(
        `launch.executable "${launch.executable}" would be looked up on the system PATH. Shared definitions may only run a file inside the server folder, or "java" with requiresJava (RealmSwap's bundled Java).`
      );
    } else if (!isSafeRelativePath(launch.executable)) {
      errors.push('launch.executable must be a relative path inside the server folder (no "..", drive letters, or absolute paths).');
    }
  }
  for (const bad of forbiddenEnvNames(launch.env)) {
    errors.push(`launch.env may not set "${bad}" (it changes which programs and libraries get loaded).`);
  }

  // --- Config files: configuration only, and never the thing that gets executed. ---
  for (const cf of data.configFiles) {
    const ext = (/\.[^.\\/]+$/.exec(cf.path)?.[0] ?? "").toLowerCase();
    if (!CONFIG_EXTENSIONS.has(ext)) {
      errors.push(`configFiles path "${cf.path}" is not a configuration file type (allowed: ${Array.from(CONFIG_EXTENSIONS).filter(Boolean).join(" ")}).`);
    }
  }
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  if (data.configFiles.some((cf) => norm(cf.path) === norm(launch.executable))) {
    errors.push("launch.executable cannot be a file the definition itself writes.");
  }

  for (const p of data.params) {
    if ((KNOWN_FIXED_VARS as readonly string[]).includes(p.key)) {
      errors.push(`Param "${p.key}" collides with a built-in variable.`);
    }
  }

  // --- Container: the stock SteamCMD image only. Its env is not restricted
  // the way launch.env is — Linux dedicated servers routinely need
  // LD_LIBRARY_PATH / HOME there, and nothing set inside the container can
  // reach past it. ---
  const container = data.container;
  if (container) {
    if (container.image !== undefined && container.image !== DEFAULT_STEAMCMD_IMAGE) {
      errors.push(`container.image must be omitted or "${DEFAULT_STEAMCMD_IMAGE}" in shared definitions.`);
    }
    if (container.executableOnPath) errors.push("container.executableOnPath is not allowed in shared definitions.");
  }

  const spec = { ...data, install, launch } as unknown as GameDefinitionSpec;
  if (errors.length === 0) errors.push(...validateSpec(spec, installMethod));
  if (errors.length > 0) return { ok: false, errors: Array.from(new Set(errors)) };

  const summary: UntrustedDefinitionSummary = {
    installMethod,
    source: installMethod === "STEAMCMD" ? `Steam app ${(install as { appId: string }).appId}` : (install as { url: string }).url,
    executable: usesBundledJava ? "java" : launch.executable,
    usesBundledJava,
    args: launch.args.flatMap((a) => (typeof a === "string" ? [a] : a.value)),
    envNames: Object.keys(launch.env ?? {}),
    configFiles: data.configFiles.map((c) => c.path),
    ports: data.ports.map((p) => `${p.port}/${p.protocol}`),
  };
  const meta: UntrustedDefinitionMeta = { name, description, icon, recommendedRamGB };
  return { ok: true, spec, installMethod, meta, summary };
}
