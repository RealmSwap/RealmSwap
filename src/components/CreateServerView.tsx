"use client";

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
  Wrench,
  FolderSync,
  History,
  LayoutDashboard,
  ShieldAlert,
  ArrowLeft,
  Sparkles,
  Info,
  Settings
} from "lucide-react";
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
  const runnerType = "LOCAL";
  const [defs, setDefs] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [ram, setRam] = useState(4);
  const [password, setPassword] = useState("");
  const [enableUpnp, setEnableUpnp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, any>>({});

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

  const minLen = selectedGame?.spec?.passwordPolicy?.minLength as number | undefined;
  const hasPasswordPolicy = typeof minLen === "number";
  // Show password field when there's a policy or when no spec indicates it's optional
  // For definitions without a passwordPolicy, show optional password field by default
  const showPasswordField = selectedGame != null;

  return (
    <div className="min-h-screen flex bg-background text-slate-100">

      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16" />
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all"
            >
              <LayoutDashboard className="w-4 h-4 text-slate-500" />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/dashboard/servers/new"
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold bg-accentPurple/10 text-white border border-accentPurple/20"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-4 h-4 text-accentPurple" />
                <span>Create Server</span>
              </div>
            </Link>

            <div className="pt-4 pb-2 px-3">
              <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider">Features</span>
            </div>

            {[
              { label: "Mod Manager", icon: Wrench, href: "/dashboard/mods" },
              { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
              { label: "Server Config", icon: Settings, href: "/dashboard/config" },
              { label: "Team Members", icon: Users, href: "/dashboard/team" },
              { label: "Audit Logs", icon: History, href: "/dashboard/logs" }
            ].map((link, i) => (
              <Link
                key={i}
                href={link.href}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-400 hover:text-white transition-all"
              >
                <div className="flex items-center gap-3">
                  <link.icon className="w-4 h-4 text-slate-500" />
                  <span>{link.label}</span>
                </div>
              </Link>
            ))}
          </nav>
        </div>

        {/* Profile Card */}
        <div className="p-4 border-t border-borderDark bg-slate-950/40">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <span className="font-bold text-sm block truncate text-slate-200">{user.name}</span>
              <span className="text-xs text-mutedText block truncate">{user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/5 text-slate-400 hover:text-red-400 rounded-lg transition-colors flex-shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </aside>

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
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-accentPurple animate-float" />
            <span>Deploy Active Server Slot</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Select a game, allocate compute memory, and launch your multiplayer world.</p>
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
                      className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between h-40 relative ${
                        isLocked
                          ? "opacity-30 cursor-not-allowed border-white/5 bg-slate-950/10"
                          : selectedGame?.id === game.id
                            ? `border-accentPurple bg-accentPurple/5 box-glow-purple cursor-pointer`
                            : "border-white/5 bg-slate-950/20 hover:bg-white/5 hover:border-white/10 cursor-pointer"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gradient-to-br ${getIconGradient(game.color)} shadow`}>
                          {game.icon}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {selectedGame?.id === game.id && !isLocked && (
                            <span className="text-[10px] bg-accentPurple/25 text-accentPurple px-2 py-0.5 rounded-full font-bold">
                              Active
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
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-100">{game.displayName}</h4>
                        <p className="text-[11px] text-mutedText leading-snug mt-0.5">{game.description}</p>
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

            {/* Local Runner Notices */}
            {runnerType === "LOCAL" && selectedGame && installNotice && (
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
    </div>
  );
}
