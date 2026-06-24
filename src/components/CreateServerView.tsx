"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Server as ServerIcon, 
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

interface CreateServerViewProps {
  user: any;
}

const AVAILABLE_GAMES = [
  { id: "MINECRAFT", name: "Minecraft", icon: "⛏️", color: "from-green-500 to-emerald-700 bg-green-500/10 border-green-500/30 text-green-400", desc: "Block building & survival", recRam: 4.0 },
  { id: "VALHEIM", name: "Valheim", icon: "⛵", color: "from-amber-500 to-amber-700 bg-amber-500/10 border-amber-500/30 text-amber-400", desc: "Co-op Viking exploration", recRam: 6.0 },
  { id: "ENSHROUDED", name: "Enshrouded", icon: "🔥", color: "from-blue-500 to-indigo-700 bg-blue-500/10 border-blue-500/30 text-blue-400", desc: "Co-op survival action RPG", recRam: 8.0 },
  { id: "ZOMBOID", name: "Project Zomboid", icon: "🧟", color: "from-red-500 to-rose-700 bg-red-500/10 border-red-500/30 text-red-400", desc: "Zombie survival RPG", recRam: 8.0 },
  { id: "ARK", name: "ARK: Survival Evolved", icon: "🦖", color: "from-cyan-500 to-blue-700 bg-cyan-500/10 border-cyan-500/30 text-cyan-400", desc: "Dinosaur taming action", recRam: 12.0 },
  { id: "TERRARIA", name: "Terraria", icon: "🌳", color: "from-lime-500 to-green-700 bg-lime-500/10 border-lime-500/30 text-lime-400", desc: "2D sandbox adventure", recRam: 2.0 },
  { id: "PALWORLD", name: "Palworld", icon: "🦊", color: "from-orange-500 to-rose-700 bg-orange-500/10 border-orange-500/30 text-orange-400", desc: "Creature-collecting survival", recRam: 8.0 },
  { id: "RUST", name: "Rust", icon: "⚙️", color: "from-stone-500 to-red-800 bg-stone-500/10 border-stone-500/30 text-stone-400", desc: "PvP survival crafting", recRam: 10.0 }
];

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
  const [selectedGame, setSelectedGame] = useState(AVAILABLE_GAMES[0]);
  const [ram, setRam] = useState(4);
  const [password, setPassword] = useState("");
  const [enableUpnp, setEnableUpnp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGameSelect = (game: typeof AVAILABLE_GAMES[0]) => {
    setSelectedGame(game);
    setRam(game.recRam); // Set recommended RAM automatically
    if (game.id === "MINECRAFT" || game.id === "TERRARIA") {
      setPassword(""); // Clear password for optional games
    }
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

    if (selectedGame.id === "VALHEIM") {
      if (!password || password.length < 5) {
        setError("Valheim dedicated servers require a password of at least 5 characters.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          game: selectedGame.id,
          ramAllocation: ram,
          password: selectedGame.id !== "MINECRAFT" ? password : null,
          enableUpnp: enableUpnp,
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

  return (
    <div className="min-h-screen flex bg-background text-slate-100">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <ServerIcon className="w-6 h-6 text-accentPurple" />
            <span className="font-extrabold text-xl tracking-wider">
              REALM<span className="text-accentPurple text-glow-purple">SWAP</span>
            </span>
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
                {AVAILABLE_GAMES.map((game) => {
                  const isLocked = false; // All catalog games unlocked for Local PC Runner
                  
                  return (
                    <div
                      key={game.id}
                      onClick={() => !isLocked && handleGameSelect(game)}
                      className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between h-40 relative ${
                        isLocked 
                          ? "opacity-30 cursor-not-allowed border-white/5 bg-slate-950/10"
                          : selectedGame.id === game.id
                            ? `border-accentPurple bg-accentPurple/5 box-glow-purple cursor-pointer`
                            : "border-white/5 bg-slate-950/20 hover:bg-white/5 hover:border-white/10 cursor-pointer"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gradient-to-br ${
                          game.id === "MINECRAFT" ? "from-green-600 to-emerald-800" :
                          game.id === "VALHEIM" ? "from-amber-600 to-amber-800" :
                          game.id === "ENSHROUDED" ? "from-blue-600 to-indigo-800" :
                          game.id === "ZOMBOID" ? "from-red-600 to-rose-800" :
                          game.id === "ARK" ? "from-cyan-600 to-blue-800" :
                          game.id === "TERRARIA" ? "from-lime-600 to-green-800" :
                          game.id === "PALWORLD" ? "from-orange-600 to-rose-800" :
                          game.id === "RUST" ? "from-stone-600 to-red-800" :
                          "from-slate-600 to-slate-800"
                        } shadow`}>
                          {game.icon}
                        </div>
                        {selectedGame.id === game.id && !isLocked && (
                          <span className="text-[10px] bg-accentPurple/25 text-accentPurple px-2 py-0.5 rounded-full font-bold">
                            Active
                          </span>
                        )}
                        {isLocked && (
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold border border-white/5">
                            Cloud Only
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-100">{game.name}</h4>
                        <p className="text-[11px] text-mutedText leading-snug mt-0.5">{game.desc}</p>
                      </div>
                    </div>
                  );
                })}
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

            {/* Server Password (All games except Minecraft) */}
            {selectedGame.id !== "MINECRAFT" && selectedGame.id !== "TERRARIA" && (
              <div className="animate-slide-down">
                <label className="text-xs font-bold text-mutedText tracking-wider uppercase block mb-2">
                  Server Password
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={selectedGame.id === "VALHEIM" ? "Enter a connection password (minimum 5 characters)" : "Enter an optional connection password"}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all duration-200 text-sm text-slate-200"
                  minLength={selectedGame.id === "VALHEIM" ? 5 : undefined}
                  required={selectedGame.id === "VALHEIM"}
                />
                <span className="text-[10px] text-mutedText mt-1.5 block">
                  {selectedGame.id === "VALHEIM" 
                    ? "⚠️ Valheim dedicated servers require a password of at least 5 characters to boot successfully."
                    : "🔒 Optional. Set a password to restrict access to your game server."}
                </span>
              </div>
            )}

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
                    <span>Recommended: {selectedGame.recRam} GB</span>
                    <span>Max: 16 GB</span>
                  </div>
                  <span className="text-[10px] text-mutedText block leading-normal pt-1.5 border-t border-white/5">
                    💡 Games like {selectedGame.name} run best with at least {selectedGame.recRam}GB of dedicated memory.
                  </span>
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
            {runnerType === "LOCAL" && (
              <div className="p-4 rounded-xl bg-accentPurple/10 border border-accentPurple/20 text-xs text-slate-300 flex gap-3 animate-slide-down">
                <Info className="w-5 h-5 text-accentPurple flex-shrink-0" />
                <div className="space-y-1">
                  {selectedGame.id === "MINECRAFT" ? (
                    <>
                      <span className="font-bold text-white block">Java Runtime Requirement</span>
                      <p className="leading-relaxed">
                        Running local Minecraft servers requires the **Java Runtime Environment (JRE) 17+** or a **JDK** installed on your PC. When you press **Start**, the app will download Minecraft server binaries directly to your project workspace.
                      </p>
                    </>
                  ) : selectedGame.id === "VALHEIM" ? (
                    <>
                      <span className="font-bold text-white block">SteamCMD & Valheim Download Size Warning</span>
                      <p className="leading-relaxed">
                        Running local Valheim servers requires **SteamCMD**. When you click **Start** on the dashboard, the app will automatically download SteamCMD, extract it, and trigger the **~2.5GB Valheim Dedicated Server download**. This download occurs in the background and details live progress in your console output log.
                      </p>
                    </>
                  ) : selectedGame.id === "ENSHROUDED" ? (
                    <>
                      <span className="font-bold text-white block">SteamCMD & Enshrouded Download Size Warning</span>
                      <p className="leading-relaxed">
                        Running local Enshrouded servers requires **SteamCMD**. When you click **Start** on the dashboard, the app will automatically download SteamCMD, extract it, and trigger the **~4GB Enshrouded Dedicated Server download** in the background. Progress will be displayed in your server console log.
                      </p>
                    </>
                  ) : selectedGame.id === "ZOMBOID" ? (
                    <>
                      <span className="font-bold text-white block">SteamCMD & Project Zomboid Download Size Warning</span>
                      <p className="leading-relaxed">
                        Running local Project Zomboid servers requires **SteamCMD**. Clicking **Start** on the dashboard automatically installs SteamCMD, extracts it, and triggers the **~3GB Project Zomboid Dedicated Server download** in the background. Progress logs will be available in the console dialog.
                      </p>
                    </>
                  ) : selectedGame.id === "ARK" ? (
                    <>
                      <span className="font-bold text-white block">SteamCMD & ARK: Survival Evolved Large Download Warning</span>
                      <p className="leading-relaxed">
                        Running local ARK servers requires **SteamCMD**. Please note that the ARK Dedicated Server is a **~15GB download**. Clicking **Start** will download it in the background. Ensure you have sufficient disk space and connection bandwidth. Live progress will be printed to the console output stream.
                      </p>
                    </>
                  ) : selectedGame.id === "TERRARIA" ? (
                    <>
                      <span className="font-bold text-white block">SteamCMD & Terraria Download Info</span>
                      <p className="leading-relaxed">
                        Running local Terraria servers requires **SteamCMD**. Clicking **Start** will download the **~1GB Terraria Dedicated Server** in the background. Password is optional.
                      </p>
                    </>
                  ) : selectedGame.id === "PALWORLD" ? (
                    <>
                      <span className="font-bold text-white block">SteamCMD & Palworld Download Size Warning</span>
                      <p className="leading-relaxed">
                        Running local Palworld servers requires **SteamCMD**. Clicking **Start** will download the **~4GB Palworld Dedicated Server** in the background. Recommended RAM is 8GB or higher.
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-white block">SteamCMD & Rust Large Download Warning</span>
                      <p className="leading-relaxed">
                        Running local Rust servers requires **SteamCMD**. The Rust Dedicated Server is a **~10GB download**. Clicking **Start** will download it in the background. Rust servers require at least 10GB RAM.
                      </p>
                    </>
                  )}
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
                disabled={loading}
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
