"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Wrench, 
  Sparkles, 
  LayoutDashboard, 
  Plus, 
  LogOut, 
  Users, 
  FolderSync, 
  History, 
  Download,
  Info,
  Check,
  AlertTriangle,
  Settings
} from "lucide-react";

interface ModsViewProps {
  servers: any[];
  user: any;
}

const RECOMMENDED_MODS: Record<string, any[]> = {
  MINECRAFT: [
    { 
      name: "Lithium (Fabric)", 
      type: "Core Optimization", 
      desc: "General-purpose physics, chunk-loading, and AI pathfinding performance enhancer.",
      downloadUrl: "https://cdn.modrinth.com/user/AANobbMI/mods/lithium/versions/mc1.20.4-0.12.1/lithium-fabric-mc1.20.4-0.12.1.jar", 
      modId: "lithium-fabric" 
    },
    { 
      name: "FerriteCore (Fabric)", 
      type: "RAM Optimizer", 
      desc: "Significantly reduces server-side memory footprint (saves up to 2GB RAM).",
      downloadUrl: "https://cdn.modrinth.com/user/OVuP18nd/mods/ferritecore/versions/6.0.3-fabric/ferritecore-6.0.3-fabric.jar", 
      modId: "ferritecore-fabric" 
    },
    { 
      name: "ViaVersion (API)", 
      type: "Compatibility", 
      desc: "Allows players on newer/older client versions to connect to your server.",
      downloadUrl: "https://github.com/ViaVersion/ViaVersion/releases/download/4.9.3/ViaVersion-4.9.3.jar", 
      modId: "ViaVersion" 
    }
  ],
  VALHEIM: [
    { 
      name: "BepInEx Loader Pack", 
      type: "Mod Core", 
      desc: "The essential BepInEx modding framework required to load DLL plugins on your server.",
      modType: "BEPINEX", 
      modId: "BepInExPack" 
    },
    { 
      name: "Valheim Plus Plugin", 
      type: "Plugin", 
      desc: "Adds configurable stamina tweaks, build sharing, inventory size modifiers, and server UI indicators. Requires BepInEx.",
      downloadUrl: "https://github.com/valheimPlus/ValheimPlus/releases/download/0.9.9.11/ValheimPlus.dll", 
      modId: "ValheimPlus" 
    }
  ],
  ZOMBOID: [
    { 
      name: "Common Sense", 
      type: "Workshop Mod", 
      desc: "Allows using crowbars to open doors, opening cans with screwdrivers, and basic QoL items.",
      workshopId: "2875848298", 
      modId: "BB_CommonSense" 
    },
    { 
      name: "Filibuster Rhymes' Used Cars!", 
      type: "Workshop Vehicles", 
      desc: "Injects dozens of lore-friendly 80s/90s vehicles, trucks, and vans into spawn tables.",
      workshopId: "1896907770", 
      modId: "FRUsedCars" 
    }
  ]
};

export default function ModsView({ servers, user }: ModsViewProps) {
  const router = useRouter();
  const [selectedServer, setSelectedServer] = useState<any | null>(servers[0] || null);
  const [customWorkshopId, setCustomWorkshopId] = useState("");
  const [customModId, setCustomModId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleInstallMod = async (mod: { modId: string; name: string; downloadUrl?: string; modType?: string; workshopId?: string }) => {
    if (!selectedServer) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modType: mod.modType || "PLUGIN",
          modId: mod.modId,
          modName: mod.name,
          downloadUrl: mod.downloadUrl,
          workshopId: mod.workshopId
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to install mod");

      setSuccess(`Successfully installed '${mod.name}' to server '${selectedServer.name}'!`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleZomboidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customWorkshopId || !customModId) return;
    handleInstallMod({
      name: `Workshop ID ${customWorkshopId} (${customModId})`,
      modId: customModId,
      workshopId: customWorkshopId
    });
    setCustomWorkshopId("");
    setCustomModId("");
  };

  const game = selectedServer?.game?.toUpperCase();
  const recommended = game ? RECOMMENDED_MODS[game] || [] : [];

  return (
    <div className="min-h-screen flex bg-background text-slate-100">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
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
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                <span>Create Server</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">Unlimited</span>
            </Link>

            <div className="pt-4 pb-2 px-3">
              <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider">Features</span>
            </div>

            {[
              { label: "Mod Manager", icon: Wrench, href: "/dashboard/mods", active: true },
              { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
              { label: "Server Config", icon: Settings, href: "/dashboard/config" },
              { label: "Team Members", icon: Users, href: "/dashboard/team" },
              { label: "Audit Logs", icon: History, href: "/dashboard/logs" }
            ].map((link, i) => (
              <Link 
                key={i} 
                href={link.href} 
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all group ${
                  link.active 
                    ? "bg-accentPurple/10 text-white border border-accentPurple/20" 
                    : "hover:bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <link.icon className={`w-4 h-4 ${link.active ? "text-accentPurple" : "text-slate-500 group-hover:text-white transition-colors"}`} />
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 py-8">
        
        {/* Navigation back */}
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
            <Wrench className="w-6 h-6 text-accentPurple animate-float" />
            <span>Mod & Plugin Manager</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Configure loaders, inject plugins, and sync Steam Workshop mods with a single click.</p>
        </div>

        {/* Server Selector Bar */}
        <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-1">Active Server Target</span>
            <span className="text-[11px] text-mutedText">Select which local game server to manage.</span>
          </div>

          <div className="min-w-[200px]">
            {servers.length === 0 ? (
              <span className="text-xs text-red-400 font-bold">No servers deployed yet</span>
            ) : (
              <select
                value={selectedServer?.id || ""}
                onChange={(e) => {
                  const s = servers.find(srv => srv.id === e.target.value);
                  setSelectedServer(s || null);
                  setError(null);
                  setSuccess(null);
                }}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
              >
                {servers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.game})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3 animate-slide-down">
            <Info className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 mb-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-3 animate-slide-down">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Dynamic Mod content */}
        {!selectedServer ? (
          <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center bg-slate-950/20">
            <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span className="font-bold text-sm block text-slate-400">No Servers Found</span>
            <p className="text-xs text-mutedText max-w-sm mx-auto mt-1">Please deploy your first local dedicated server from the Dashboard to start installing mods.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left/Middle Column: Installers */}
            <div className="lg:col-span-2 space-y-6">
              
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-accentPurple" />
                  <span>Popular Mods & Core Loaders</span>
                </h3>
                <p className="text-xs text-mutedText">Recommended performance adjustments and server utilities for {selectedServer.game}.</p>
                
                {recommended.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-white/5 bg-slate-950/20 text-center text-xs text-mutedText">
                    No custom mod packages listed for {selectedServer.game}. Check the custom installer panel.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {recommended.map((mod, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-white/5 bg-slate-950/40 hover:border-white/10 transition-colors flex flex-col justify-between h-44">
                        <div>
                          <span className="text-[9px] bg-accentPurple/25 text-accentPurple px-2 py-0.5 rounded font-extrabold uppercase tracking-wide">
                            {mod.type}
                          </span>
                          <h4 className="font-extrabold text-sm text-slate-100 mt-2">{mod.name}</h4>
                          <p className="text-[11px] text-mutedText mt-1 leading-normal">{mod.desc}</p>
                        </div>

                        <div className="pt-3 border-t border-white/5 mt-3 flex justify-end">
                          <button
                            onClick={() => handleInstallMod(mod)}
                            disabled={loading || selectedServer.status === "RUNNING"}
                            className="px-4 py-1.5 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Install Pack</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zomboid Workshop Form */}
              {game === "ZOMBOID" && (
                <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4 animate-slide-down">
                  <h3 className="font-extrabold text-base text-white">Custom Workshop Mod Setup</h3>
                  <p className="text-xs text-mutedText">Enter any Steam Workshop Item ID and Mod ID to configure the runner to download it on boot.</p>
                  
                  <form onSubmit={handleZomboidSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div>
                      <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1">Steam Workshop ID</label>
                      <input
                        type="text"
                        value={customWorkshopId}
                        onChange={(e) => setCustomWorkshopId(e.target.value)}
                        placeholder="e.g. 2875848298"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1">Mod Identifier</label>
                      <input
                        type="text"
                        value={customModId}
                        onChange={(e) => setCustomModId(e.target.value)}
                        placeholder="e.g. BB_CommonSense"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={loading || selectedServer.status === "RUNNING"}
                        className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
                      >
                        Add Workshop Mod
                      </button>
                    </div>
                  </form>
                </div>
              )}

            </div>

            {/* Right Column: Status & Guidelines */}
            <div className="space-y-6">
              
              {/* Server State */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-3">
                <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block">Target Server Status</span>
                
                <div className="flex items-center gap-3">
                  <div className={`w-3.5 h-3.5 rounded-full ${selectedServer.status === "RUNNING" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></div>
                  <div>
                    <span className="font-extrabold text-sm text-slate-200 block">{selectedServer.name}</span>
                    <span className="text-[10px] text-mutedText">Status: {selectedServer.status}</span>
                  </div>
                </div>

                {selectedServer.status === "RUNNING" && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex gap-2.5 leading-normal animate-slide-down">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <span className="font-bold block">Lock Active</span>
                      <span>Please turn off the server in the dashboard before installing or configuring mods. Modifying running files leads to save corruption.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-3">
                <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block">Usage Guidelines</span>
                
                <div className="text-xs text-slate-400 leading-normal space-y-3">
                  <p>💡 **Fabric/Forge support:** For Minecraft, make sure you install a fabric-compatible loader JAR or download Fabric plugins if you use Paper/Spigot.</p>
                  <p>🛠️ **BepInEx requirement:** Valheim plugins require BepInEx to load DLL files. Make sure you install the BepInEx Loader Pack first.</p>
                  <p>📁 **File locations:** Mods are stored inside the `local-servers/[id]` folder. You can add custom DLLs or JARs manually by opening your project directory on disk.</p>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>
    </div>
  );
}
