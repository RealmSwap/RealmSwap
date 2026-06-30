"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  MapPin,
  Cpu,
  Clock,
  LogOut,
  Users,
  BadgeCent,
  History,
  LayoutDashboard,
  ShieldAlert,
  ArrowLeft,
  Sparkles,
  Info,
  Settings,
  Terminal,
  Store,
  UploadCloud,
  Package,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";
import DefinitionParamFields from "./DefinitionParamFields";

interface CreateServerViewProps {
  user: any;
}

const REGIONS = [
  { id: "US_EAST", name: "US East (N. Virginia)", ping: "15ms", load: "Light" },
  { id: "US_WEST", name: "US West (Oregon)", ping: "42ms", load: "Normal" },
  { id: "EU_CENTRAL", name: "EU Central (Frankfurt)", ping: "85ms", load: "Light" },
  { id: "ASIA", name: "Asia Pacific (Singapore)", ping: "148ms", load: "Heavy" }
];

export default function CreateServerView({ user }: CreateServerViewProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState<"LOCAL" | "DOCKER">("LOCAL");
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [defs, setDefs] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [ram, setRam] = useState(4);
  const [password, setPassword] = useState("");
  const [enableUpnp, setEnableUpnp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, any>>({});

  // Migration Wizard State
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importManifest, setImportManifest] = useState<any | null>(null);
  const [importTempFile, setImportTempFile] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"NEW" | "REPLACE">("NEW");
  const [replaceServerId, setReplaceServerId] = useState<string>("");
  const [myServers, setMyServers] = useState<any[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/definitions")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(`Failed to load game definitions: ${data.error}. Please ensure your database is running and migrated.`);
          return;
        }
        const list: any[] = data.definitions ?? [];
        setDefs(list);
        if (list.length > 0) {
          setSelectedGame(list[0]);
          setRam(list[0].recommendedRamGB ?? 4);
          const init: Record<string, any> = {};
          (list[0].spec?.params ?? []).forEach((p: any) => { if (p.default !== undefined) init[p.key] = p.default; });
          setParamValues(init);
        }
      })
      .catch((err) => {
        console.error("Failed to load definitions:", err);
        setError("Network error: Failed to connect to the server to load game definitions.");
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system/docker-status")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => { if (!cancelled) setDockerAvailable(!!d.available); })
      .catch(() => { if (!cancelled) setDockerAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  const handleGameSelect = (game: any) => {
    setSelectedGame(game);
    setRam(game.recommendedRamGB ?? 4);
    const init: Record<string, any> = {};
    (game.spec?.params ?? []).forEach((p: any) => { if (p.default !== undefined) init[p.key] = p.default; });
    setParamValues(init);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please specify a server name.");
      return;
    }

    const minLen = selectedGame?.spec?.passwordPolicy?.minLength;
    if (minLen && (!password || password.length < minLen)) {
      setError(`${selectedGame.displayName} requires a password of at least ${minLen} characters.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          definitionId: selectedGame.id,
          ramAllocation: ram,
          password: password || null,
          enableUpnp,
          paramValues,
          runnerType: runtime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create server");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An error occurred. Try again.");
      setLoading(false);
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith(".realm")) {
      setError("Please select a .realm package file.");
      return;
    }
    setIsImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/realms/validate", {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/octet-stream" }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data || "Validation failed");
      
      setImportManifest(data.manifest);
      setImportTempFile(data.tempFile);

      const srvRes = await fetch("/api/servers");
      if (srvRes.ok) {
        const srvData = await srvRes.json();
        setMyServers(srvData.servers || []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportSubmit = async () => {
    if (importMode === "REPLACE" && !replaceServerId) {
      setError("Please select a server to replace.");
      return;
    }
    setIsImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/realms/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempFile: importTempFile,
          mode: importMode,
          serverId: importMode === "REPLACE" ? replaceServerId : undefined,
          manifest: importManifest
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data || "Import failed");
      router.push("/dashboard");
      router.refresh();
    } catch(e: any) {
      setError(e.message);
      setIsImporting(false);
    }
  };

  const selectedHasContainer = !!selectedGame?.spec?.container;
  const dockerSelectable = dockerAvailable && selectedHasContainer;

  // Reset to LOCAL when the selected game no longer supports Docker
  useEffect(() => {
    if (!dockerSelectable) setRuntime("LOCAL");
  }, [dockerSelectable]);

  // Derive install notice text generically from definition fields
  const installNotice = selectedGame ? (() => {
    const installMethod = selectedGame.installMethod as string | undefined;
    const requiredDiskGB = selectedGame.requiredDiskGB as number | undefined;
    const requiresJava = selectedGame?.spec?.requiresJava as boolean | undefined;

    if (requiresJava) {
      return {
        title: "Java Runtime Requirement",
        body: `Running local ${selectedGame.displayName} servers requires the Java Runtime Environment (JRE 17+) or a JDK installed on your PC. When you press Start, the app will download server binaries directly to your project workspace.`,
      };
    }

    if (installMethod === "STEAMCMD") {
      const sizeNote = requiredDiskGB ? ` ~${requiredDiskGB}GB download.` : "";
      return {
        title: `SteamCMD & ${selectedGame.displayName} Download Size Warning`,
        body: `Running local ${selectedGame.displayName} servers requires SteamCMD. When you click Start on the dashboard, the app will automatically download SteamCMD, extract it, and trigger the${sizeNote ? ` ${selectedGame.displayName} Dedicated Server download (${requiredDiskGB}GB).` : " server download."} Progress will be displayed in your server console log.`,
      };
    }

    return null;
  })() : null;

  // Extract gradient classes from the color field for the icon background
  const getIconGradient = (color: string) => {
    if (!color) return "from-slate-600 to-slate-800";
    const classes = color.split(" ").filter((c: string) => c.startsWith("from-") || c.startsWith("to-"));
    // Shift from-X-500 → from-X-600 and to-X-700 → to-X-800 for icon depth, but just use as-is
    return classes.join(" ") || "from-slate-600 to-slate-800";
  };

  const getGameArt = (game: string) => {
    switch(game) {
      case "MINECRAFT": return "/games/minecraft.jpg";
      case "VALHEIM": return "/games/valheim.jpg";
      case "ENSHROUDED": return "/games/enshrouded.jpg";
      case "ZOMBOID": return "/games/zomboid.jpg";
      case "ARK": return "/games/ark.jpg";
      case "TERRARIA": return "/games/terraria.jpg";
      case "PALWORLD": return "/games/palworld.jpg";
      case "RUST": return "/games/rust.jpg";
      case "SATISFACTORY": return "/games/satisfactory.jpg";
      case "VRISING": return "/games/vrising.jpg";
      case "WINDROSE": return "/games/windrose.jpg";
      default: return "/games/generic.jpg";
    }
  };

  const minLen = selectedGame?.spec?.passwordPolicy?.minLength as number | undefined;
  const hasPasswordPolicy = typeof minLen === "number";
  // Show password field when there's a policy or when no spec indicates it's optional
  // For definitions without a passwordPolicy, show optional password field by default
  const showPasswordField = selectedGame != null;

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">

      {/* Sidebar Navigation */}
      <SidebarNavigation user={user} />

      {/* Main Form Area */}
      <main className="flex-1 overflow-y-auto px-6 py-8">

        {/* Navigation back helper */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-accentPurple animate-float" />
              <span>Deploy Active Server Slot</span>
            </h1>
            <p className="text-sm text-mutedText mt-1">Select a game, allocate compute memory, and launch your multiplayer world.</p>
          </div>
          
          {/* Drag & Drop Import Zone */}
          <div 
            className={`w-full md:w-72 p-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 ${
              isDragging ? "border-accentPurple bg-accentPurple/10" : "border-white/10 hover:border-white/20 hover:bg-white/5"
            } ${isImporting ? "opacity-50 pointer-events-none" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".realm" 
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} 
            />
            {isImporting && !importManifest ? (
              <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
            ) : (
              <UploadCloud className={`w-6 h-6 ${isDragging ? "text-accentPurple" : "text-slate-400"}`} />
            )}
            <div>
              <span className="text-sm font-bold text-slate-200 block">Import .realm Package</span>
              <span className="text-xs text-mutedText">Drag & drop or click to upload</span>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="glass-panel rounded-2xl border border-white/5 p-6 max-w-4xl">
          {error && (
            <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3 animate-slide-down">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-bold block">Deployment Blocked</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">



            {/* Game Selector Grid */}
            <div>
              <label className="text-xs font-bold text-mutedText tracking-wider uppercase block mb-3">
                1. Select Game
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {defs.map((game) => {
                  const isLocked = false; // All catalog games unlocked for Local PC Runner

                  return (
                    <div
                      key={game.id}
                      onClick={() => !isLocked && handleGameSelect(game)}
                      className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between h-40 relative overflow-hidden group ${
                        isLocked
                          ? "opacity-30 cursor-not-allowed border-white/5 bg-slate-950/10"
                          : selectedGame?.id === game.id
                            ? `border-accentPurple bg-accentPurple/5 box-glow-purple cursor-pointer`
                            : "border-white/5 bg-slate-950/20 hover:bg-white/5 hover:border-white/10 cursor-pointer"
                      }`}
                    >
                      <div className={`absolute inset-0 bg-cover bg-center transition-all duration-500 ${selectedGame?.id === game.id ? 'opacity-60 scale-105' : 'opacity-30 group-hover:opacity-50 group-hover:scale-105'}`} style={{ backgroundImage: `url('${getGameArt(game.slug)}')` }}></div>
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/20 pointer-events-none"></div>
                      
                      <div className="relative z-10 flex justify-between items-start">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gradient-to-br ${getIconGradient(game.color)} shadow border border-white/10`}>
                          {game.icon}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {selectedGame?.id === game.id && !isLocked && (
                            <span className="text-[10px] bg-accentPurple/30 border border-accentPurple/50 text-white px-2 py-0.5 rounded-full font-bold shadow-[0_0_10px_rgba(167,139,250,0.5)]">
                              Selected
                            </span>
                          )}
                          {isLocked && (
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold border border-white/5">
                              Cloud Only
                            </span>
                          )}
                          {!game.isBuiltIn && (
                            <span className="text-[9px] bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full font-bold border border-purple-500/20">
                              Custom
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="relative z-10">
                        <h4 className="font-extrabold text-sm text-slate-100">{game.displayName}</h4>
                        <p className="text-[11px] text-slate-300 leading-snug mt-0.5 drop-shadow-md">{game.description}</p>
                      </div>
                    </div>
                  );
                })}

                {/* + Custom Game card */}
                <Link
                  href="/dashboard/definitions/new"
                  className="p-4 rounded-xl border border-dashed border-white/15 bg-slate-950/20 hover:border-accentPurple/50 flex flex-col items-center justify-center h-40 text-slate-400 hover:text-accentPurple transition-all"
                >
                  <Plus className="w-6 h-6 mb-2" />
                  <span className="font-bold text-sm">Custom Game</span>
                  <span className="text-[11px] mt-0.5">Define your own server</span>
                </Link>
              </div>
            </div>

            {/* Server Name input */}
            <div>
              <label className="text-xs font-bold text-mutedText tracking-wider uppercase block mb-2">
                2. Server Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Co-op Server"
                className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all duration-200 text-sm text-slate-200"
                maxLength={40}
                required
              />
            </div>

            {/* Server Password */}
            {selectedGame && showPasswordField && (
              <div className="animate-slide-down">
                <label className="text-xs font-bold text-mutedText tracking-wider uppercase block mb-2">
                  Server Password
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasPasswordPolicy ? `Enter a connection password (minimum ${minLen} characters)` : "Enter an optional connection password"}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all duration-200 text-sm text-slate-200"
                  minLength={hasPasswordPolicy ? minLen : undefined}
                  required={hasPasswordPolicy}
                />
                <span className="text-[10px] text-mutedText mt-1.5 block">
                  {hasPasswordPolicy
                    ? `⚠️ ${selectedGame.displayName} dedicated servers require a password of at least ${minLen} characters to boot successfully.`
                    : "🔒 Optional. Set a password to restrict access to your game server."}
                </span>
              </div>
            )}

            {/* Game-specific params */}
            <DefinitionParamFields
              params={selectedGame?.spec?.params ?? []}
              values={paramValues}
              onChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
            />

            <div className="grid md:grid-cols-2 gap-8">
              {/* RAM Allocation Slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-mutedText tracking-wider uppercase">
                    3. RAM Allocation
                  </label>
                  <span className="text-sm font-bold text-accentPurple">{ram} GB</span>
                </div>

                <div className="p-5 rounded-xl bg-slate-950/40 border border-white/5 space-y-4">
                  <input
                    type="range"
                    min="2"
                    max="16"
                    step="1"
                    value={ram}
                    onChange={(e) => setRam(parseInt(e.target.value))}
                    className="w-full accent-accentPurple cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-mutedText font-semibold">
                    <span>Min: 2 GB</span>
                    {selectedGame && <span>Recommended: {selectedGame.recommendedRamGB} GB</span>}
                    <span>Max: 16 GB</span>
                  </div>
                  {selectedGame && (
                    <span className="text-[10px] text-mutedText block leading-normal pt-1.5 border-t border-white/5">
                      💡 Games like {selectedGame.displayName} run best with at least {selectedGame.recommendedRamGB}GB of dedicated memory.
                    </span>
                  )}
                </div>
              </div>

              {/* Network & Port Forwarding */}
              <div>
                <label className="text-xs font-bold text-mutedText tracking-wider uppercase block mb-2">
                  4. Network & Port Forwarding
                </label>
                <div className="p-5 rounded-xl bg-slate-950/40 border border-accentPurple/25 flex flex-col justify-between h-[115px]">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="enableUpnp"
                      checked={enableUpnp}
                      onChange={(e) => setEnableUpnp(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-accentPurple focus:ring-accentPurple mt-1 accent-accentPurple cursor-pointer"
                    />
                    <label htmlFor="enableUpnp" className="cursor-pointer select-none">
                      <span className="font-bold text-sm text-slate-200 block">Auto-Port Forwarding (UPnP)</span>
                      <span className="text-[11px] text-mutedText block mt-0.5 leading-relaxed">
                        Instructs router to forward incoming traffic directly to your PC so friends can join over your WAN IP.
                      </span>
                    </label>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold border-t border-white/5 pt-2 mt-2">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Localhost (127.0.0.1) & Public WAN IP
                    </span>
                    <span className="text-accentPurple font-mono">UPnP Active</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Runtime Selector */}
            <div className="mt-4">
              <label className="block text-sm text-mutedText mb-2">Runtime</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRuntime("LOCAL")}
                  className={`px-3 py-2 rounded-lg border text-sm ${runtime === "LOCAL" ? "border-accent text-accent" : "border-white/10 text-mutedText"}`}
                >
                  Local PC
                </button>
                <button
                  type="button"
                  disabled={!dockerSelectable}
                  onClick={() => dockerSelectable && setRuntime("DOCKER")}
                  title={
                    !dockerAvailable
                      ? "Docker daemon not detected"
                      : !selectedHasContainer
                      ? "This game does not support containers yet"
                      : "Run this server in a Docker container"
                  }
                  className={`px-3 py-2 rounded-lg border text-sm ${runtime === "DOCKER" ? "border-accent text-accent" : "border-white/10 text-mutedText"} ${!dockerSelectable ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  Docker
                </button>
              </div>
              {runtime === "DOCKER" && (
                <p className="text-xs text-mutedText mt-2">Runs in a Linux container via SteamCMD. Requires Docker Desktop running.</p>
              )}
            </div>

            {/* Local Runner Notices */}
            {runtime === "LOCAL" && selectedGame && installNotice && (
              <div className="p-4 rounded-xl bg-accentPurple/10 border border-accentPurple/20 text-xs text-slate-300 flex gap-3 animate-slide-down">
                <Info className="w-5 h-5 text-accentPurple flex-shrink-0" />
                <div className="space-y-1">
                  <span className="font-bold text-white block">{installNotice.title}</span>
                  <p className="leading-relaxed">{installNotice.body}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
              <Link
                href="/dashboard"
                className="px-5 py-3 rounded-xl bg-slate-900 border border-white/5 hover:border-white/10 text-slate-300 font-bold transition-all text-sm"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading || !selectedGame}
                className="bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-white font-bold px-8 py-3 rounded-xl text-sm transition-all shadow-lg shadow-accentPurple/10 border border-accentPurple/30"
              >
                {loading ? "Deploying Server..." : "Deploy Game World"}
              </button>
            </div>

          </form>
        </div>

      </main>
      {/* Migration Wizard Modal */}
      {importManifest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-xl glass-panel border border-accentPurple/30 rounded-2xl p-6 shadow-2xl flex flex-col box-glow-purple max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accentPurple/20 rounded-lg">
                  <Package className="w-6 h-6 text-accentPurple" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-lg">Import Realm Package</h3>
                  <p className="text-xs text-mutedText">Review package details and select import destination.</p>
                </div>
              </div>
              <button 
                onClick={() => { setImportManifest(null); setImportTempFile(null); }}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 rounded-lg bg-slate-900 border border-white/5">
                <span className="text-[10px] uppercase tracking-wider text-mutedText font-bold block mb-1">Server Name</span>
                <span className="text-sm font-bold text-slate-200">{importManifest.server.name}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900 border border-white/5">
                <span className="text-[10px] uppercase tracking-wider text-mutedText font-bold block mb-1">Game Engine</span>
                <span className="text-sm font-bold text-slate-200">{importManifest.server.game}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900 border border-white/5">
                <span className="text-[10px] uppercase tracking-wider text-mutedText font-bold block mb-1">Installed Mods</span>
                <span className="text-sm font-bold text-slate-200">{importManifest.mods?.length || 0}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900 border border-white/5">
                <span className="text-[10px] uppercase tracking-wider text-mutedText font-bold block mb-1">Scheduled Tasks</span>
                <span className="text-sm font-bold text-slate-200">{importManifest.tasks?.length || 0}</span>
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <h4 className="font-bold text-sm text-white">Import Options</h4>
              
              <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${importMode === "NEW" ? "bg-accentPurple/10 border-accentPurple/40" : "bg-slate-900/50 border-white/5 hover:border-white/10"}`}>
                <input 
                  type="radio" 
                  name="importMode" 
                  checked={importMode === "NEW"} 
                  onChange={() => setImportMode("NEW")} 
                  className="mt-1"
                />
                <div>
                  <span className="font-bold text-slate-200 block text-sm">Import as New Server</span>
                  <span className="text-xs text-mutedText">Creates a new server slot and restores all data.</span>
                </div>
              </label>

              <label className={`flex flex-col gap-3 p-4 rounded-xl border cursor-pointer transition-all ${importMode === "REPLACE" ? "bg-accentPurple/10 border-accentPurple/40" : "bg-slate-900/50 border-white/5 hover:border-white/10"}`}>
                <div className="flex items-start gap-3">
                  <input 
                    type="radio" 
                    name="importMode" 
                    checked={importMode === "REPLACE"} 
                    onChange={() => setImportMode("REPLACE")} 
                    className="mt-1"
                  />
                  <div>
                    <span className="font-bold text-slate-200 block text-sm">Replace Existing Server</span>
                    <span className="text-xs text-mutedText">Overwrites all files and data of an existing server.</span>
                  </div>
                </div>
                
                {importMode === "REPLACE" && (
                  <div className="ml-7">
                    <select 
                      value={replaceServerId} 
                      onChange={(e) => setReplaceServerId(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accentPurple"
                    >
                      <option value="">Select a server...</option>
                      {myServers.filter(s => s.game === importManifest.server.game).map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                      ))}
                    </select>
                  </div>
                )}
              </label>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-auto pt-4 border-t border-white/10">
              <button
                onClick={() => { setImportManifest(null); setImportTempFile(null); }}
                className="px-4 py-2 rounded-lg font-bold text-sm text-slate-300 hover:text-white transition-colors"
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                onClick={handleImportSubmit}
                disabled={isImporting}
                className="px-5 py-2 rounded-lg font-extrabold text-sm bg-accentPurple hover:bg-purple-500 text-white shadow-lg hover:shadow-purple-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    <span>Import Realm</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
