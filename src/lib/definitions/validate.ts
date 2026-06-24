import path from "path";
import type { GameDefinitionSpec, InstallMethod, ParamSpec, ArgSpec } from "./types";
import { collectVariables } from "./template";

export const KNOWN_FIXED_VARS = ["name", "nameSanitized", "password", "passwordEmpty", "port", "ram"] as const;

/** Returns true if a path segment string is unsafe (absolute or contains ".." segments). */
function isUnsafePath(p: string): boolean {
  // Check both POSIX and Windows absolute forms so this gate is host-OS-independent.
  // path.isAbsolute alone is platform-specific: a "C:\..." path is not absolute on a
  // POSIX host, so it would slip through when the validator runs on Linux (e.g. CI).
  if (path.win32.isAbsolute(p) || path.posix.isAbsolute(p)) return true;
  const segments = p.split(/[\\/]/);
  return segments.some((seg) => seg === "..");
}

function argStrings(args: ArgSpec[]): string[] {
  return args.flatMap((a) => (typeof a === "string" ? [a] : [...a.value, `{${a.includeWhen}}`]));
}

export function validateSpec(spec: GameDefinitionSpec, installMethod: InstallMethod): string[] {
  const errors: string[] = [];
  const known = new Set<string>([...KNOWN_FIXED_VARS, ...spec.params.map((p) => p.key)]);

  const inst = spec.install as any;
  if (installMethod === "STEAMCMD") {
    for (const f of ["appId", "installSubDir", "checkFile", "requiredDiskGB"]) {
      if (inst[f] === undefined || inst[f] === "") errors.push(`Steam install requires "${f}".`);
    }
  } else if (installMethod === "DOWNLOAD") {
    for (const f of ["url", "fileName", "checkFile"]) {
      if (!inst[f]) errors.push(`Download install requires "${f}".`);
    }
  } else if (installMethod === "CUSTOM_SCRIPT") {
    if (!inst.installScript) errors.push(`Custom script install requires "installScript".`);
  }

  // Finding 1: block launchScript/installScript when installMethod !== CUSTOM_SCRIPT
  if (installMethod !== "CUSTOM_SCRIPT") {
    if (spec.launch.launchScript) {
      errors.push(`launchScript/installScript are only allowed for CUSTOM_SCRIPT definitions.`);
    }
    if (inst.installScript) {
      errors.push(`launchScript/installScript are only allowed for CUSTOM_SCRIPT definitions.`);
    }
  }

  if (installMethod === "CUSTOM_SCRIPT" && spec.launch.launchScript) {
    // ok — script launch
  } else if (!spec.launch.executable) {
    errors.push(`Launch requires an "executable".`);
  }

  // Finding 2: block path traversal in config paths and install sub-paths
  for (const cf of spec.configFiles) {
    if (isUnsafePath(cf.path)) {
      errors.push(`Path "${cf.path}" must be a relative path without ".." segments.`);
    }
  }
  if (spec.editableConfigPath && isUnsafePath(spec.editableConfigPath)) {
    errors.push(`Path "${spec.editableConfigPath}" must be a relative path without ".." segments.`);
  }
  // Defense-in-depth: check install sub-paths that are written to disk
  for (const field of ["installSubDir", "fileName", "checkFile"] as const) {
    const val = inst[field];
    if (typeof val === "string" && val && isUnsafePath(val)) {
      errors.push(`Path "${val}" must be a relative path without ".." segments.`);
    }
  }

  const templated: string[] = [
    ...argStrings(spec.launch.args ?? []),
    ...Object.values(spec.launch.env ?? {}),
    ...spec.configFiles.map((c) => c.template ?? ""),
    ...spec.ports.map((p) => p.port),
  ];
  for (const t of templated) {
    for (const v of collectVariables(t)) {
      if (!known.has(v)) errors.push(`Unknown template variable {${v}} (not a fixed field or declared param).`);
    }
  }

  for (const p of spec.params) {
    if (p.type === "enum" && (!p.options || p.options.length === 0)) {
      errors.push(`Param "${p.key}" is an enum and must declare options.`);
    }
  }

  if (!(spec.defaultPort >= 1 && spec.defaultPort <= 65535)) {
    errors.push(`defaultPort must be between 1 and 65535.`);
  }

  return errors;
}

export function validateParamValues(params: ParamSpec[], values: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const p of params) {
    const v = values[p.key];
    const missing = v === undefined || v === null || v === "";
    if (missing) {
      if (p.required) errors.push(`Param "${p.key}" is required.`);
      continue;
    }
    if (p.type === "number") {
      const n = Number(v);
      if (Number.isNaN(n)) errors.push(`Param "${p.key}" must be a number.`);
      else if (p.min != null && n < p.min) errors.push(`Param "${p.key}" must be >= ${p.min}.`);
      else if (p.max != null && n > p.max) errors.push(`Param "${p.key}" must be <= ${p.max}.`);
    } else if (p.type === "boolean") {
      if (typeof v !== "boolean") errors.push(`Param "${p.key}" must be a boolean.`);
    } else if (p.type === "enum") {
      if (!p.options?.includes(String(v))) errors.push(`Param "${p.key}" must be one of: ${p.options?.join(", ")}.`);
    }
  }
  return errors;
}
