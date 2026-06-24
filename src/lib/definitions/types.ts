export type InstallMethod = "STEAMCMD" | "DOWNLOAD" | "CUSTOM_SCRIPT";
export type ParamType = "text" | "number" | "boolean" | "enum";
export type Protocol = "TCP" | "UDP";
export type ConfigStrategy = "template" | "enshroudedJson" | "zomboidIniMerge";

export interface ParamSpec {
  key: string;
  label: string;
  type: ParamType;
  default?: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
  required?: boolean;
}

export type ArgSpec = string | { value: string[]; includeWhen: string };

export interface ConfigFileSpec {
  path: string;
  strategy: ConfigStrategy;
  template?: string;
}

export interface PortSpec { protocol: Protocol; port: string; }

export interface StdoutPattern { regex: string; updateField: "ipAddress"; transform?: "joinCode"; }

export interface PasswordPolicy { minLength?: number; fallback?: string; }

export interface SteamcmdInstall { appId: string; installSubDir: string; checkFile: string; requiredDiskGB: number; }
export interface DownloadInstall { url: string; fileName: string; checkFile: string; installSubDir?: string; unzip?: boolean; }
export interface ScriptInstall { installScript: string; }

export interface LaunchSpec {
  executable: string;
  args: ArgSpec[];
  cwdSubDir?: string;
  env?: Record<string, string>;
  stdoutPatterns?: StdoutPattern[];
  stdinStopCommand?: string;
  launchScript?: string;
  executableOnPath?: boolean;   // true: spawn executable by name (found on PATH, e.g. "java", "cmd.exe"); false/omitted: resolve against the install dir
  preLaunchDirs?: string[];     // directories (relative to install dir) to create before launch
}

export interface GameDefinitionSpec {
  install: SteamcmdInstall | DownloadInstall | ScriptInstall;
  launch: LaunchSpec;
  defaultPort: number;
  params: ParamSpec[];
  configFiles: ConfigFileSpec[];
  editableConfigPath?: string;
  ports: PortSpec[];
  requiresJava?: boolean;
  passwordPolicy?: PasswordPolicy;
}

export interface DefinitionContext {
  name: string;
  nameSanitized: string;
  password: string;
  port: number;
  ram: number;
  [paramKey: string]: string | number | boolean;
}
