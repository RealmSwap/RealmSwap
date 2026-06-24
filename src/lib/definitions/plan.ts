import path from "path";
import type {
  GameDefinitionSpec, InstallMethod, DefinitionContext,
  ConfigStrategy, Protocol, StdoutPattern,
} from "./types";
import { renderTemplate, renderArgs } from "./template";

export interface InstallPlan {
  method: InstallMethod;
  appId?: string; installSubDir?: string; checkFile?: string; requiredDiskGB?: number;
  url?: string; fileName?: string; unzip?: boolean;
  installScript?: string;
}
export interface ConfigFilePlan { relPath: string; strategy: ConfigStrategy; content?: string; }
export interface LaunchPlan {
  executable: string; args: string[]; cwdSubDir?: string;
  env?: Record<string, string>; stdoutPatterns?: StdoutPattern[];
  stdinStopCommand?: string; launchScript?: string;
  executableOnPath?: boolean;
  preLaunchDirs?: string[];
}

/** Resolve the command to spawn. If executableOnPath is true the executable is
 *  found on PATH (e.g. "java", "cmd.exe") and is returned as-is. Otherwise it
 *  is resolved as a path relative to the install directory. */
export function resolveCommand(installDir: string, executable: string, executableOnPath?: boolean): string {
  return executableOnPath ? executable : path.join(installDir, executable);
}
export interface PortPlan { protocol: Protocol; port: number; }

export function planInstall(spec: GameDefinitionSpec, installMethod: InstallMethod): InstallPlan {
  const i = spec.install as any;
  if (installMethod === "STEAMCMD") {
    return { method: "STEAMCMD", appId: i.appId, installSubDir: i.installSubDir, checkFile: i.checkFile, requiredDiskGB: i.requiredDiskGB };
  }
  if (installMethod === "DOWNLOAD") {
    return { method: "DOWNLOAD", url: i.url, fileName: i.fileName, checkFile: i.checkFile, installSubDir: i.installSubDir, unzip: !!i.unzip };
  }
  return { method: "CUSTOM_SCRIPT", installScript: i.installScript };
}

export function planConfigFiles(spec: GameDefinitionSpec, ctx: DefinitionContext): ConfigFilePlan[] {
  return spec.configFiles.map((c) => {
    if (c.strategy === "template") {
      return { relPath: c.path, strategy: c.strategy, content: renderTemplate(c.template ?? "", ctx) };
    }
    return { relPath: c.path, strategy: c.strategy };
  });
}

export function planLaunch(spec: GameDefinitionSpec, ctx: DefinitionContext): LaunchPlan {
  const l = spec.launch;
  const env = l.env ? Object.fromEntries(Object.entries(l.env).map(([k, v]) => [k, renderTemplate(v, ctx)])) : undefined;
  return {
    executable: l.executable,
    args: renderArgs(l.args ?? [], ctx),
    cwdSubDir: l.cwdSubDir,
    env,
    stdoutPatterns: l.stdoutPatterns,
    stdinStopCommand: l.stdinStopCommand,
    launchScript: l.launchScript,
    executableOnPath: l.executableOnPath,
    preLaunchDirs: l.preLaunchDirs,
  };
}

export function planPorts(spec: GameDefinitionSpec, ctx: DefinitionContext): PortPlan[] {
  return spec.ports.map((p) => ({ protocol: p.protocol, port: parseInt(renderTemplate(p.port, ctx), 10) }));
}
