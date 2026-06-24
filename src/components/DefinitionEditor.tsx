"use client";

import React, { useState, useRef, useLayoutEffect, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ShieldAlert,
  HelpCircle,
} from "lucide-react";
import type {
  GameDefinitionSpec,
  InstallMethod,
  ParamSpec,
  ParamType,
  ConfigFileSpec,
  PortSpec,
  ArgSpec,
} from "@/lib/definitions/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface DefinitionEditorProps {
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Sub-form row types (plain objects used in local state)
// ---------------------------------------------------------------------------
interface ParamRow {
  key: string;
  label: string;
  type: ParamType;
  default: string;
  options: string; // csv → split on submit
  min: string;
  max: string;
  required: boolean;
}

interface ConfigFileRow {
  path: string;
  template: string;
}

interface PortRow {
  protocol: "TCP" | "UDP";
  port: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DEFAULT_COLOR =
  "from-slate-500 to-slate-700 bg-slate-500/10 border-slate-500/30 text-slate-400";

const FIELD_HELP = {
  // Basic Info
  displayName: 'Name shown in your server catalog. Free-form, e.g. "My ARK Server".',
  icon: "A single emoji used as the catalog icon, e.g. 🦖. Up to 4 characters.",
  description: "Short blurb shown under the name in the catalog. Optional.",
  recommendedRam:
    "Suggested RAM for this server, shown as guidance when creating one. Check the game's server docs; e.g. 4.",
  defaultPort:
    "Primary network port the server listens on (1–65535). Use the game's documented default, e.g. 27015 for Source games.",

  // SteamCMD
  steamAppId:
    "The numeric Steam ID of the dedicated-server app. Find it on SteamDB or the store URL store.steampowered.com/app/<ID>. Dedicated servers often have a different ID than the game — search SteamDB for the '… Dedicated Server' entry, e.g. 376030.",
  scInstallSubDir:
    "Folder (created under the install root) that holds this game's files. Use a short slug, e.g. ark-server, to keep games from colliding on disk.",
  scCheckFile:
    "A file that exists only after a successful install, used to verify install completed. Pick the server executable or a known data file, relative to the install dir, e.g. ShooterGame/Binaries/Win64/ShooterGameServer.exe.",
  requiredDisk:
    "Approximate disk space the install needs; warns before installing if space is low. Check the game's SteamDB 'Disk' size, e.g. 30.",

  // Download
  downloadUrl:
    "Direct URL to the server archive or binary, e.g. https://example.com/server.zip. Must be publicly reachable from this host.",
  fileName:
    "Name to save the downloaded file as, e.g. server.zip. Include the correct extension so unzip works.",
  dlCheckFile:
    "A file that exists only after a successful install, used to verify install completed, relative to the install dir, e.g. server.exe.",
  dlInstallSubDir:
    "Optional folder (under the install root) to place files in, e.g. server-files. Leave blank to use the install root.",
  unzip:
    "Tick if the downloaded file is an archive (.zip) that should be extracted after download.",

  // Custom Script
  installScript:
    "Shell script that installs the server. Runs with this app's privileges on the host — only use trusted scripts.",
  launchScript:
    "Shell script that starts the server. Runs with this app's privileges on the host.",
  ack:
    "Required acknowledgement: custom scripts run with full host privileges of this app's account.",

  // Launch Configuration
  executable:
    "The program launched to start the server, relative to the working dir, e.g. server.exe. If it's a global command like java, enter the command and tick 'Executable is on PATH'.",
  cwdSubDir:
    "Folder (relative to install dir) to run the server from. Set it when the executable expects to launch from its own folder, e.g. ShooterGame/Binaries/Win64.",
  executableOnPath:
    "Tick when the executable is a global command (java, python, node) resolved via PATH rather than a file inside the install directory.",
  launchArgs:
    "Command-line arguments passed to the executable, one per row, e.g. -batchmode. Reference params with {{paramKey}} if needed.",
  readyPattern:
    "Optional regex pattern to match against server logs to determine when the server is fully started and ready for players. E.g. 'Server started'.",

  // Params builder
  paramKey:
    "Variable name referenced in config templates and args as {{key}}. No spaces, e.g. maxPlayers.",
  paramLabel:
    'Human-friendly name shown to users when they create a server, e.g. "Max Players".',
  paramType:
    "Field type users get: text, number (enforces Min/Max), boolean (checkbox), or enum (dropdown — fill Options).",
  paramDefault: "Pre-filled value when a user creates a server. Optional.",
  paramRequired: "Tick to force users to provide a value for this parameter.",
  paramOptions: "Comma-separated choices for the dropdown, e.g. easy,normal,hard.",
  paramMin: "Lowest allowed numeric value users can enter.",
  paramMax: "Highest allowed numeric value users can enter.",

  // Config Files builder
  configPath:
    "Path (relative to install dir) of a config file written before each launch, e.g. config/server.cfg.",
  configTemplate:
    "File contents written at launch. {{paramKey}} is replaced with the param's value, so users' settings flow into the config, e.g. MaxPlayers={{maxPlayers}}.",

  // Ports builder
  portProtocol: "TCP or UDP — match what the game server uses for this port.",
  portNumber:
    "An extra port (beyond Default Port) the server uses, e.g. 27016. Check the game's server docs.",

  requiresPassword: "Tick if this game server supports or requires a password to join. Users will be prompted to enter a password when creating a server.",
} as const;

function emptyParam(): ParamRow {
  return { key: "", label: "", type: "text", default: "", options: "", min: "", max: "", required: false };
}
function emptyConfigFile(): ConfigFileRow {
  return { path: "", template: "" };
}
function emptyPort(): PortRow {
  return { protocol: "TCP", port: "" };
}

// ---------------------------------------------------------------------------
// Small reusable UI pieces
// ---------------------------------------------------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-mutedText tracking-wider uppercase mb-3">
      {children}
    </p>
  );
}

function InputBase({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all text-sm text-slate-200 ${className}`}
    />
  );
}

function TextareaBase({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all text-sm text-slate-200 font-mono resize-y ${className}`}
    />
  );
}

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type TooltipPlacement = { vertical: "top" | "bottom"; horizontal: "left" | "right" };

function FieldHelp({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  // Default to above-and-left-aligned; measurement flips it away from viewport edges.
  const [placement, setPlacement] = useState<TooltipPlacement>({ vertical: "top", horizontal: "left" });
  const id = React.useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  // When the tooltip opens, measure available space and flip it to whichever
  // side keeps it on screen. Runs before paint so there's no visible jump.
  useIsomorphicLayoutEffect(() => {
    if (!open || !buttonRef.current || !tipRef.current) return;
    const btn = buttonRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const margin = 8;
    const spaceAbove = btn.top;
    const spaceBelow = window.innerHeight - btn.bottom;
    const vertical: TooltipPlacement["vertical"] =
      spaceAbove < tip.height + margin && spaceBelow > spaceAbove ? "bottom" : "top";
    const horizontal: TooltipPlacement["horizontal"] =
      btn.left + tip.width > window.innerWidth - margin ? "right" : "left";
    setPlacement((prev) =>
      prev.vertical === vertical && prev.horizontal === horizontal ? prev : { vertical, horizontal },
    );
  }, [open]);

  const verticalClass = placement.vertical === "top" ? "bottom-full mb-1" : "top-full mt-1";
  const horizontalClass = placement.horizontal === "left" ? "left-0" : "right-0";

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label ? `Help: ${label}` : "Help"}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="text-slate-500 hover:text-accentPurple focus-visible:text-accentPurple rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accentPurple transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          className={`absolute ${verticalClass} ${horizontalClass} z-50 w-64 px-3 py-2 rounded-lg bg-slate-950 border border-white/10 shadow-lg text-xs text-slate-300 font-normal normal-case leading-relaxed pointer-events-none`}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function FieldLabel({ children, help }: { children: React.ReactNode; help?: string }) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-400 mb-1 font-semibold">
      <span>{children}</span>
      {help && <FieldHelp text={help} label={typeof children === "string" ? children : undefined} />}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Params builder
// ---------------------------------------------------------------------------
function ParamsBuilder({
  rows,
  onChange,
}: {
  rows: ParamRow[];
  onChange: (rows: ParamRow[]) => void;
}) {
  const update = (i: number, patch: Partial<ParamRow>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="p-3 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel help={FIELD_HELP.paramKey}>Key</FieldLabel>
              <InputBase
                value={row.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="e.g. maxPlayers"
              />
            </div>
            <div>
              <FieldLabel help={FIELD_HELP.paramLabel}>Label</FieldLabel>
              <InputBase
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="e.g. Max Players"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <FieldLabel help={FIELD_HELP.paramType}>Type</FieldLabel>
              <select
                value={row.type}
                onChange={(e) => update(i, { type: e.target.value as ParamType })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 focus:border-accentPurple outline-none text-sm text-slate-200"
              >
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="enum">enum</option>
              </select>
            </div>
            <div>
              <FieldLabel help={FIELD_HELP.paramDefault}>Default</FieldLabel>
              <InputBase
                value={row.default}
                onChange={(e) => update(i, { default: e.target.value })}
                placeholder="default value"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-400 pb-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={row.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                  className="accent-accentPurple"
                />
                Required
                <FieldHelp text={FIELD_HELP.paramRequired} label="Required" />
              </label>
            </div>
          </div>
          {row.type === "enum" && (
            <div>
              <FieldLabel help={FIELD_HELP.paramOptions}>Options (comma-separated)</FieldLabel>
              <InputBase
                value={row.options}
                onChange={(e) => update(i, { options: e.target.value })}
                placeholder="e.g. easy,normal,hard"
              />
            </div>
          )}
          {row.type === "number" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel help={FIELD_HELP.paramMin}>Min</FieldLabel>
                <InputBase
                  type="number"
                  value={row.min}
                  onChange={(e) => update(i, { min: e.target.value })}
                  placeholder="min"
                />
              </div>
              <div>
                <FieldLabel help={FIELD_HELP.paramMax}>Max</FieldLabel>
                <InputBase
                  type="number"
                  value={row.max}
                  onChange={(e) => update(i, { max: e.target.value })}
                  placeholder="max"
                />
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => remove(i)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, emptyParam()])}
        className="flex items-center gap-1.5 text-xs text-accentPurple hover:text-accentPurpleHover font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Parameter
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config files builder
// ---------------------------------------------------------------------------
function ConfigFilesBuilder({
  rows,
  onChange,
}: {
  rows: ConfigFileRow[];
  onChange: (rows: ConfigFileRow[]) => void;
}) {
  const update = (i: number, patch: Partial<ConfigFileRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="p-3 rounded-xl bg-slate-950/40 border border-white/5 space-y-2">
          <div>
            <FieldLabel help={FIELD_HELP.configPath}>File Path (relative to install dir)</FieldLabel>
            <InputBase
              value={row.path}
              onChange={(e) => update(i, { path: e.target.value })}
              placeholder="e.g. config/server.cfg"
            />
          </div>
          <div>
            <FieldLabel help={FIELD_HELP.configTemplate}>Template (use {"{{param}}"} for variables)</FieldLabel>
            <TextareaBase
              rows={4}
              value={row.template}
              onChange={(e) => update(i, { template: e.target.value })}
              placeholder={"# Server config\nMaxPlayers={{maxPlayers}}\n"}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => remove(i)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, emptyConfigFile()])}
        className="flex items-center gap-1.5 text-xs text-accentPurple hover:text-accentPurpleHover font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Config File
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ports builder
// ---------------------------------------------------------------------------
function PortsBuilder({
  rows,
  onChange,
}: {
  rows: PortRow[];
  onChange: (rows: PortRow[]) => void;
}) {
  const update = (i: number, patch: Partial<PortRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-24 inline-flex items-center gap-1 text-xs text-slate-400 font-semibold">
          Protocol
          <FieldHelp text={FIELD_HELP.portProtocol} label="Protocol" />
        </span>
        <span className="flex-1 inline-flex items-center gap-1 text-xs text-slate-400 font-semibold">
          Port
          <FieldHelp text={FIELD_HELP.portNumber} label="Port" />
        </span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={row.protocol}
            onChange={(e) => update(i, { protocol: e.target.value as "TCP" | "UDP" })}
            className="px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 focus:border-accentPurple outline-none text-sm text-slate-200 w-24"
          >
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
          </select>
          <InputBase
            type="number"
            value={row.port}
            onChange={(e) => update(i, { port: e.target.value })}
            placeholder="Port number"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-red-400 hover:text-red-300 transition-colors p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, emptyPort()])}
        className="flex items-center gap-1.5 text-xs text-accentPurple hover:text-accentPurpleHover font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Port
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Args builder (simple string list)
// ---------------------------------------------------------------------------
function ArgsBuilder({
  args,
  onChange,
}: {
  args: string[];
  onChange: (args: string[]) => void;
}) {
  const update = (i: number, val: string) => {
    onChange(args.map((a, idx) => (idx === i ? val : a)));
  };
  const remove = (i: number) => onChange(args.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {args.map((arg, i) => (
        <div key={i} className="flex items-center gap-2">
          <InputBase
            value={arg}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`--arg${i + 1}`}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-red-400 hover:text-red-300 transition-colors p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...args, ""])}
        className="flex items-center gap-1.5 text-xs text-accentPurple hover:text-accentPurpleHover font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Argument
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function DefinitionEditor({ isAdmin }: DefinitionEditorProps) {
  const router = useRouter();

  // Tab
  const [tab, setTab] = useState<InstallMethod>("STEAMCMD");

  // Common fields
  const [displayName, setDisplayName] = useState("");
  const [icon, setIcon] = useState("🎮");
  const [description, setDescription] = useState("");
  const [recommendedRamGB, setRecommendedRamGB] = useState("4");
  const [defaultPort, setDefaultPort] = useState("27015");
  const [requiresPassword, setRequiresPassword] = useState(false);

  // STEAMCMD install fields
  const [sc_appId, setSc_appId] = useState("");
  const [sc_installSubDir, setSc_installSubDir] = useState("");
  const [sc_checkFile, setSc_checkFile] = useState("");
  const [sc_requiredDiskGB, setSc_requiredDiskGB] = useState("");

  // DOWNLOAD install fields
  const [dl_url, setDl_url] = useState("");
  const [dl_fileName, setDl_fileName] = useState("");
  const [dl_checkFile, setDl_checkFile] = useState("");
  const [dl_unzip, setDl_unzip] = useState(false);
  const [dl_installSubDir, setDl_installSubDir] = useState("");

  // CUSTOM_SCRIPT install fields
  const [cs_installScript, setCs_installScript] = useState("");
  const [cs_launchScript, setCs_launchScript] = useState("");
  const [ack, setAck] = useState(false);

  // Launch fields (STEAMCMD / DOWNLOAD)
  const [executable, setExecutable] = useState("");
  const [args, setArgs] = useState<string[]>([]);
  const [cwdSubDir, setCwdSubDir] = useState("");
  const [executableOnPath, setExecutableOnPath] = useState(false);
  const [readyPattern, setReadyPattern] = useState("");

  // Params, config files, ports
  const [params, setParams] = useState<ParamRow[]>([]);
  const [configFiles, setConfigFiles] = useState<ConfigFileRow[]>([]);
  const [ports, setPorts] = useState<PortRow[]>([]);

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Spec assembly
  // ---------------------------------------------------------------------------
  const buildSpec = (): GameDefinitionSpec => {
    // Install
    let install: GameDefinitionSpec["install"];
    if (tab === "STEAMCMD") {
      install = {
        appId: sc_appId.trim(),
        installSubDir: sc_installSubDir.trim(),
        checkFile: sc_checkFile.trim(),
        requiredDiskGB: Number(sc_requiredDiskGB) || 0,
      };
    } else if (tab === "DOWNLOAD") {
      install = {
        url: dl_url.trim(),
        fileName: dl_fileName.trim(),
        checkFile: dl_checkFile.trim(),
        ...(dl_unzip ? { unzip: true } : {}),
        ...(dl_installSubDir.trim() ? { installSubDir: dl_installSubDir.trim() } : {}),
      };
    } else {
      // CUSTOM_SCRIPT
      install = {
        installScript: cs_installScript,
      };
    }

    // Launch
    const argSpecs: ArgSpec[] = args.filter((a) => a.trim() !== "").map((a) => a);
    let launch: GameDefinitionSpec["launch"];
    if (tab === "CUSTOM_SCRIPT") {
      launch = {
        executable: "",
        args: argSpecs,
        launchScript: cs_launchScript,
      };
    } else {
      launch = {
        executable: executable.trim(),
        args: argSpecs,
        ...(cwdSubDir.trim() ? { cwdSubDir: cwdSubDir.trim() } : {}),
        ...(executableOnPath ? { executableOnPath: true } : {}),
        ...(readyPattern.trim() ? { readyPattern: readyPattern.trim() } : {}),
      };
    }

    // Params
    const builtParams: ParamSpec[] = params
      .filter((p) => p.key.trim() && p.label.trim())
      .map((p) => {
        const spec: ParamSpec = {
          key: p.key.trim(),
          label: p.label.trim(),
          type: p.type,
        };
        if (p.default.trim()) {
          if (p.type === "number") spec.default = Number(p.default);
          else if (p.type === "boolean") spec.default = p.default === "true";
          else spec.default = p.default;
        }
        if (p.type === "enum" && p.options.trim()) {
          spec.options = p.options.split(",").map((o) => o.trim()).filter(Boolean);
        }
        if (p.type === "number") {
          if (p.min.trim()) spec.min = Number(p.min);
          if (p.max.trim()) spec.max = Number(p.max);
        }
        if (p.required) spec.required = true;
        return spec;
      });

    // Config files
    const builtConfigFiles: ConfigFileSpec[] = configFiles
      .filter((cf) => cf.path.trim())
      .map((cf) => ({
        path: cf.path.trim(),
        strategy: "template" as const,
        template: cf.template,
      }));

    // Ports
    const builtPorts: PortSpec[] = ports
      .filter((pr) => pr.port.trim())
      .map((pr) => ({
        protocol: pr.protocol,
        port: pr.port.trim(),
      }));

    return {
      install,
      launch,
      defaultPort: Number(defaultPort) || 27015,
      params: builtParams,
      configFiles: builtConfigFiles,
      ports: builtPorts,
      ...(requiresPassword ? { passwordPolicy: {} } : {}),
    };
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (tab === "CUSTOM_SCRIPT" && !ack) {
      setError("You must acknowledge the custom script warning before submitting.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const spec = buildSpec();
      const res = await fetch("/api/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          icon: icon.trim() || "🎮",
          color: DEFAULT_COLOR,
          description: description.trim(),
          recommendedRamGB: Number(recommendedRamGB) || 4,
          installMethod: tab,
          spec,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          typeof data?.error === "string"
            ? data.error
            : `Error ${res.status}: ${res.statusText}`;
        setError(msg);
        setLoading(false);
        return;
      }

      router.push("/dashboard/servers/new");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Tab config
  // ---------------------------------------------------------------------------
  const tabs: { id: InstallMethod; label: string; adminOnly?: boolean }[] = [
    { id: "STEAMCMD", label: "SteamCMD" },
    { id: "DOWNLOAD", label: "Download" },
    { id: "CUSTOM_SCRIPT", label: "Custom Script", adminOnly: true },
  ];
  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex bg-background text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] hidden md:flex flex-col justify-between">
        <div>
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>
          <nav className="p-4 space-y-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all"
            >
              <span>Dashboard</span>
            </Link>
            <Link
              href="/dashboard/servers/new"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all"
            >
              <span>Create Server</span>
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-6 py-8">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/dashboard/servers/new"
            className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Create Server
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <Plus className="w-6 h-6 text-accentPurple" />
            New Game Definition
          </h1>
          <p className="text-sm text-mutedText mt-1">
            Define a custom game server that will appear in your server catalog.
          </p>
        </div>

        {/* Form card */}
        <div className="glass-panel rounded-2xl border border-white/5 p-6 max-w-4xl">

          {/* Error banner */}
          {error && (
            <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3 animate-slide-down">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-bold block">Submission Error</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">

            {/* ── Common fields ─────────────────────────────────── */}
            <section className="space-y-4">
              <SectionLabel>Basic Info</SectionLabel>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel help={FIELD_HELP.displayName}>Display Name *</FieldLabel>
                  <InputBase
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="My Custom Server"
                    required
                  />
                </div>
                <div>
                  <FieldLabel help={FIELD_HELP.icon}>Icon (emoji)</FieldLabel>
                  <InputBase
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="🎮"
                    maxLength={4}
                  />
                </div>
              </div>
              <div>
                <FieldLabel help={FIELD_HELP.description}>Description</FieldLabel>
                <TextareaBase
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the game server…"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel help={FIELD_HELP.recommendedRam}>Recommended RAM (GB)</FieldLabel>
                  <InputBase
                    type="number"
                    min="1"
                    value={recommendedRamGB}
                    onChange={(e) => setRecommendedRamGB(e.target.value)}
                    placeholder="4"
                  />
                </div>
                <div>
                  <FieldLabel help={FIELD_HELP.defaultPort}>Default Port</FieldLabel>
                  <InputBase
                    type="number"
                    min="1"
                    max="65535"
                    value={defaultPort}
                    onChange={(e) => setDefaultPort(e.target.value)}
                    placeholder="27015"
                  />
                </div>
              </div>
              <div className="pt-2">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={requiresPassword}
                    onChange={(e) => setRequiresPassword(e.target.checked)}
                    className="accent-accentPurple"
                  />
                  Requires Server Password
                  <FieldHelp text={FIELD_HELP.requiresPassword} label="Requires Password" />
                </label>
              </div>
            </section>

            {/* ── Install method tabs ───────────────────────────── */}
            <section className="space-y-4">
              <SectionLabel>Install Method</SectionLabel>

              {/* Tab switcher */}
              <div className="flex gap-2">
                {visibleTabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      tab === t.id
                        ? "bg-accentPurple/20 text-accentPurple border border-accentPurple/40"
                        : "bg-slate-950/40 text-slate-400 border border-white/5 hover:border-white/10 hover:text-slate-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* STEAMCMD fields */}
              {tab === "STEAMCMD" && (
                <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel help={FIELD_HELP.steamAppId}>Steam App ID *</FieldLabel>
                      <InputBase
                        value={sc_appId}
                        onChange={(e) => setSc_appId(e.target.value)}
                        placeholder="e.g. 376030"
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel help={FIELD_HELP.scInstallSubDir}>Install Sub-Directory *</FieldLabel>
                      <InputBase
                        value={sc_installSubDir}
                        onChange={(e) => setSc_installSubDir(e.target.value)}
                        placeholder="e.g. ark-server"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel help={FIELD_HELP.scCheckFile}>Check File (path confirming install) *</FieldLabel>
                      <InputBase
                        value={sc_checkFile}
                        onChange={(e) => setSc_checkFile(e.target.value)}
                        placeholder="e.g. ShooterGame/Binaries/Win64/ShooterGameServer.exe"
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel help={FIELD_HELP.requiredDisk}>Required Disk (GB)</FieldLabel>
                      <InputBase
                        type="number"
                        min="0"
                        value={sc_requiredDiskGB}
                        onChange={(e) => setSc_requiredDiskGB(e.target.value)}
                        placeholder="e.g. 30"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* DOWNLOAD fields */}
              {tab === "DOWNLOAD" && (
                <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-4">
                  <div>
                    <FieldLabel help={FIELD_HELP.downloadUrl}>Download URL *</FieldLabel>
                    <InputBase
                      value={dl_url}
                      onChange={(e) => setDl_url(e.target.value)}
                      placeholder="https://example.com/server.zip"
                      required
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel help={FIELD_HELP.fileName}>File Name *</FieldLabel>
                      <InputBase
                        value={dl_fileName}
                        onChange={(e) => setDl_fileName(e.target.value)}
                        placeholder="server.zip"
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel help={FIELD_HELP.dlCheckFile}>Check File (path confirming install) *</FieldLabel>
                      <InputBase
                        value={dl_checkFile}
                        onChange={(e) => setDl_checkFile(e.target.value)}
                        placeholder="e.g. server.exe"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel help={FIELD_HELP.dlInstallSubDir}>Install Sub-Directory (optional)</FieldLabel>
                      <InputBase
                        value={dl_installSubDir}
                        onChange={(e) => setDl_installSubDir(e.target.value)}
                        placeholder="e.g. server-files"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dl_unzip}
                          onChange={(e) => setDl_unzip(e.target.checked)}
                          className="accent-accentPurple"
                        />
                        Extract / Unzip after download
                        <FieldHelp text={FIELD_HELP.unzip} label="Extract / Unzip" />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* CUSTOM_SCRIPT fields */}
              {tab === "CUSTOM_SCRIPT" && (
                <div className="space-y-4">
                  {/* Warning block */}
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                    <p className="font-bold">⚠️ Custom scripts run with this app&apos;s privileges on this host.</p>
                    <p className="mt-1">Only run scripts you trust. They can read and modify any file your account can.</p>
                    <label className="flex items-center gap-2 mt-3 text-slate-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                        className="accent-accentPurple"
                      />
                      I understand and accept the risk.
                      <FieldHelp text={FIELD_HELP.ack} label="Accept risk" />
                    </label>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-4">
                    <div>
                      <FieldLabel help={FIELD_HELP.installScript}>Install Script *</FieldLabel>
                      <TextareaBase
                        rows={8}
                        value={cs_installScript}
                        onChange={(e) => setCs_installScript(e.target.value)}
                        placeholder={"#!/bin/bash\n# Install your game server here\n"}
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel help={FIELD_HELP.launchScript}>Launch Script *</FieldLabel>
                      <TextareaBase
                        rows={8}
                        value={cs_launchScript}
                        onChange={(e) => setCs_launchScript(e.target.value)}
                        placeholder={"#!/bin/bash\n# Start your game server here\n"}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ── Launch config (STEAMCMD / DOWNLOAD only) ─────── */}
            {(tab === "STEAMCMD" || tab === "DOWNLOAD") && (
              <section className="space-y-4">
                <SectionLabel>Launch Configuration</SectionLabel>
                <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel help={FIELD_HELP.executable}>Executable *</FieldLabel>
                      <InputBase
                        value={executable}
                        onChange={(e) => setExecutable(e.target.value)}
                        placeholder="e.g. server.exe"
                        required
                      />
                    </div>
                    <div>
                      <FieldLabel help={FIELD_HELP.cwdSubDir}>Working Directory Sub-path (optional)</FieldLabel>
                      <InputBase
                        value={cwdSubDir}
                        onChange={(e) => setCwdSubDir(e.target.value)}
                        placeholder="e.g. ShooterGame/Binaries/Win64"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={executableOnPath}
                        onChange={(e) => setExecutableOnPath(e.target.checked)}
                        className="accent-accentPurple"
                      />
                      Executable is on PATH (e.g. <code className="text-xs bg-slate-800 px-1 rounded">java</code>, interpreter commands)
                      <FieldHelp text={FIELD_HELP.executableOnPath} label="Executable on PATH" />
                    </label>
                  </div>

                  <div>
                    <FieldLabel help={FIELD_HELP.readyPattern}>Ready Log Pattern (Regex)</FieldLabel>
                    <InputBase
                      value={readyPattern}
                      onChange={(e) => setReadyPattern(e.target.value)}
                      placeholder="e.g. Server started"
                    />
                  </div>

                  <div>
                    <FieldLabel help={FIELD_HELP.launchArgs}>Launch Arguments</FieldLabel>
                    <ArgsBuilder args={args} onChange={setArgs} />
                  </div>
                </div>
              </section>
            )}

            {/* ── Parameters builder ───────────────────────────── */}
            <section className="space-y-4">
              <SectionLabel>Server Parameters (optional)</SectionLabel>
              <p className="text-xs text-mutedText -mt-2">
                Define configurable values users can set when creating a server (e.g. max players, difficulty).
              </p>
              <ParamsBuilder rows={params} onChange={setParams} />
            </section>

            {/* ── Config files builder ─────────────────────────── */}
            <section className="space-y-4">
              <SectionLabel>Config Files (optional)</SectionLabel>
              <p className="text-xs text-mutedText -mt-2">
                Templated config files written before launch. Use {"{{paramKey}}"} for variable substitution.
              </p>
              <ConfigFilesBuilder rows={configFiles} onChange={setConfigFiles} />
            </section>

            {/* ── Ports builder ────────────────────────────────── */}
            <section className="space-y-4">
              <SectionLabel>Additional Ports (optional)</SectionLabel>
              <p className="text-xs text-mutedText -mt-2">
                Extra ports beyond the default port that this server uses.
              </p>
              <PortsBuilder rows={ports} onChange={setPorts} />
            </section>

            {/* ── Submit ───────────────────────────────────────── */}
            <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
              <Link
                href="/dashboard/servers/new"
                className="px-5 py-3 rounded-xl bg-slate-900 border border-white/5 hover:border-white/10 text-slate-300 font-bold transition-all text-sm"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading || (tab === "CUSTOM_SCRIPT" && !ack)}
                className="bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-xl text-sm transition-all shadow-lg shadow-accentPurple/10 border border-accentPurple/30"
              >
                {loading ? "Saving…" : "Save Definition"}
              </button>
            </div>

          </form>
        </div>
      </main>
    </div>
  );
}
