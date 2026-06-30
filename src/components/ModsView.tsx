"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
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
  History,
  Download,
  Info,
  Check,
  AlertTriangle,
  Settings,
  Upload,
  DownloadCloud,
  Search,
  Loader2,
  Clock,
  Terminal,
  Store,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";

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
  const [installedMods, setInstalledMods] = useState<any[]>([]);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configTargetMod, setConfigTargetMod] = useState<any | null>(null);
  const [configSections, setConfigSections] = useState<any[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [popularMods, setPopularMods] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  React.useEffect(() => {
    if (selectedServer) {
      fetch(`/api/servers/${selectedServer.id}/mods`)
        .then(res => res.json())
        .then(data => {
          if (data.mods) setInstalledMods(data.mods);
        })
        .catch(err => console.error(err));
    } else {
      setInstalledMods([]);
      setSearchResults([]);
      setPopularMods([]);
      setSearchQuery("");
    }
  }, [selectedServer]);

  // Fetch Popular Mods on Mount
  React.useEffect(() => {
    if (!selectedServer || (selectedServer.game !== "VALHEIM" && selectedServer.game !== "MINECRAFT")) return;
    
    setIsSearching(true);
    fetch(`/api/servers/${selectedServer.id}/mods/search?q=`)
      .then(res => res.json())
      .then(data => {
        if (data.results) setPopularMods(data.results);
      })
      .catch(err => console.error("Popular mods fetch failed:", err))
      .finally(() => setIsSearching(false));
  }, [selectedServer]);

  // Debounced Search
  React.useEffect(() => {
    if (!selectedServer || searchQuery.trim() === "") {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(() => {
      fetch(`/api/servers/${selectedServer.id}/mods/search?q=${encodeURIComponent(searchQuery)}`)
        .then(res => res.json())
        .then(data => {
          if (data.results) setSearchResults(data.results);
        })
        .catch(err => console.error("Search failed:", err))
        .finally(() => setIsSearching(false));
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedServer]);

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
      // Refresh installed mods
      const modsRes = await fetch(`/api/servers/${selectedServer.id}/mods`);
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCollection = () => {
    if (!selectedServer) return;
    window.open(`/api/servers/${selectedServer.id}/mods/export`, '_blank');
  };

  const handleImportCollection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedServer || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("collection", file);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/import`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import collection");

      setSuccess(data.message || "Collection imported successfully!");
      // Refresh installed mods
      const modsRes = await fetch(`/api/servers/${selectedServer.id}/mods`);
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    
    // Reset input
    e.target.value = '';
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

  const handleConfigureClick = async (mod: any) => {
    if (!selectedServer) return;
    setConfigTargetMod(mod);
    setConfigModalOpen(true);
    setConfigLoading(true);
    setConfigSections([]);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/${mod.id}/config`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfigSections(data.sections || []);
    } catch (err: any) {
      alert(err.message || "Failed to load config");
      setConfigModalOpen(false);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedServer || !configTargetMod) return;
    setConfigSaving(true);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/${configTargetMod.id}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: configSections })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("Configuration saved successfully!");
      setConfigModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to save config");
    } finally {
      setConfigSaving(false);
    }
  };

  const updateConfigValue = (sectionIdx: number, propIdx: number, newValue: string) => {
    const newSections = [...configSections];
    newSections[sectionIdx].properties[propIdx].value = newValue;
    setConfigSections(newSections);
  };

  const game = selectedServer?.game?.toUpperCase();
  const recommended = game ? RECOMMENDED_MODS[game] || [] : [];

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      
      {/* Sidebar Navigation */}
      <SidebarNavigation user={user} />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 py-8 pb-24 md:pb-8">
        
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    <Sparkles className="w-4.5 h-4.5 text-accentPurple" />
                    <span>Mod Browser</span>
                  </h3>
                  
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search live database..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={!selectedServer || (game !== "VALHEIM" && game !== "MINECRAFT")}
                      className="pl-9 pr-4 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors w-full sm:w-64 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {isSearching && (
                      <Loader2 className="w-4 h-4 text-accentPurple absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
                    )}
                  </div>
                </div>

                <p className="text-xs text-mutedText">
                  {searchQuery.trim().length > 0 
                    ? `Search results for "${searchQuery}"`
                    : `Most popular mods on ${game === "VALHEIM" ? "Thunderstore" : game === "MINECRAFT" ? "Modrinth" : "Workshop"}`
                  }
                </p>
                
                {searchQuery.trim().length > 0 ? (
                  searchResults.length === 0 && !isSearching ? (
                    <div className="p-4 rounded-xl border border-dashed border-white/5 bg-slate-950/20 text-center text-xs text-mutedText">
                      No mods found matching "{searchQuery}".
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      {searchResults.map((mod, idx) => (
                        <div key={idx} className="p-4 rounded-xl border border-white/5 bg-slate-950/40 hover:border-white/10 transition-colors flex flex-col justify-between h-44">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] bg-accentPurple/25 text-accentPurple px-2 py-0.5 rounded font-extrabold uppercase tracking-wide">
                                {mod.provider}
                              </span>
                              <span className="text-[9px] text-mutedText font-mono">v{mod.version}</span>
                            </div>
                            <h4 className="font-extrabold text-sm text-slate-100 mt-2 truncate" title={mod.name}>{mod.name}</h4>
                            <p className="text-[10px] text-mutedText truncate mb-1">by {mod.author}</p>
                            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-normal" title={mod.description}>{mod.description}</p>
                          </div>

                          <div className="pt-3 border-t border-white/5 mt-3 flex justify-end">
                            <button
                              onClick={() => handleInstallMod({
                                name: mod.name,
                                modId: mod.packageId,
                                downloadUrl: mod.downloadUrl,
                                modType: game === "VALHEIM" ? "PLUGIN" : undefined
                              })}
                              disabled={loading || selectedServer.status === "RUNNING"}
                              className="px-4 py-1.5 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                            >
                              {loading ? (
                                <>
                                  <Wrench className="w-3.5 h-3.5 animate-spin" />
                                  <span>Sandboxing...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Safe Install</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : popularMods.length === 0 && isSearching ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="w-8 h-8 text-accentPurple animate-spin" />
                  </div>
                ) : popularMods.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-white/5 bg-slate-950/20 text-center text-xs text-mutedText">
                    No custom mod packages listed for {selectedServer.game}. Check the custom installer panel.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {popularMods.map((mod, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-white/5 bg-slate-950/40 hover:border-white/10 transition-colors flex flex-col justify-between h-44">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] bg-accentPurple/25 text-accentPurple px-2 py-0.5 rounded font-extrabold uppercase tracking-wide">
                              TRENDING
                            </span>
                            <span className="text-[9px] text-mutedText font-mono">v{mod.version}</span>
                          </div>
                          <h4 className="font-extrabold text-sm text-slate-100 mt-2 truncate" title={mod.name}>{mod.name}</h4>
                          <p className="text-[10px] text-mutedText truncate mb-1">by {mod.author}</p>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-normal" title={mod.description}>{mod.description}</p>
                        </div>

                        <div className="pt-3 border-t border-white/5 mt-3 flex justify-end">
                          <button
                            onClick={() => handleInstallMod({
                                name: mod.name,
                                modId: mod.packageId,
                                downloadUrl: mod.downloadUrl,
                                modType: game === "VALHEIM" ? "PLUGIN" : undefined
                              })}
                            disabled={loading || selectedServer.status === "RUNNING"}
                            className="px-4 py-1.5 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                          >
                            {loading ? (
                              <>
                                <Wrench className="w-3.5 h-3.5 animate-spin" />
                                <span>Sandboxing...</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
                                <span>Safe Install</span>
                              </>
                            )}
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

            {/* Installed Mods Section */}
            <div className="lg:col-span-3 space-y-4 animate-slide-down mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="font-extrabold text-base text-white">Installed Mods</h3>
                
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 text-xs font-bold text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import Collection</span>
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={handleImportCollection} 
                      disabled={loading || selectedServer.status === "RUNNING"}
                    />
                  </label>
                  
                  <button
                    onClick={handleExportCollection}
                    disabled={installedMods.length === 0}
                    className="px-3 py-1.5 rounded-lg border border-accentPurple/30 bg-accentPurple/10 hover:bg-accentPurple/20 text-accentPurple text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <DownloadCloud className="w-3.5 h-3.5" />
                    <span>Export Collection</span>
                  </button>
                </div>
              </div>

              {installedMods.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-white/5 bg-slate-950/20 text-center text-xs text-mutedText">
                  No mods currently installed.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {installedMods.map((mod: any) => (
                    <div key={mod.id} className="p-4 rounded-xl border border-white/5 bg-slate-950/40 hover:border-white/10 transition-colors flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-extrabold uppercase tracking-wide">
                            {mod.provider}
                          </span>
                          <span className="text-[9px] text-mutedText font-mono">{mod.version}</span>
                        </div>
                        <h4 className="font-extrabold text-sm text-slate-100 mt-2 truncate" title={mod.name}>{mod.name}</h4>
                        <p className="text-[11px] text-mutedText mt-1 font-mono truncate">{mod.packageId}</p>
                      </div>
                      <div className="pt-3 border-t border-white/5 mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => handleConfigureClick(mod)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors"
                        >
                          Configure
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Config Modal */}
      {configModalOpen && configTargetMod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f111a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-slide-down">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-accentPurple" />
                  Configure {configTargetMod.name}
                </h3>
                <p className="text-xs text-mutedText mt-1 font-mono">{configTargetMod.packageId}</p>
              </div>
              <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {configLoading ? (
                <div className="text-center py-10">
                  <Wrench className="w-8 h-8 text-slate-600 animate-spin mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-400">Parsing configuration files...</p>
                </div>
              ) : configSections.length === 0 ? (
                <div className="text-center py-10 bg-slate-900/50 rounded-xl border border-white/5">
                  <p className="text-sm font-bold text-slate-400">No configuration properties found.</p>
                </div>
              ) : (
                configSections.map((section, sIdx) => (
                  <div key={sIdx} className="space-y-4">
                    <h4 className="font-bold text-sm text-accentPurple border-b border-white/5 pb-2 uppercase tracking-wide">
                      [{section.name}]
                    </h4>
                    <div className="space-y-5">
                      {section.properties.map((prop: any, pIdx: number) => (
                        <div key={pIdx} className="bg-slate-950/40 p-4 rounded-xl border border-white/5">
                          <div className="flex justify-between items-start gap-4 mb-2">
                            <div>
                              <label className="text-sm font-bold text-slate-200 block">{prop.key}</label>
                              {prop.description && (
                                <p className="text-[11px] text-slate-400 mt-1 whitespace-pre-line leading-relaxed">
                                  {prop.description}
                                </p>
                              )}
                            </div>
                            <span className="text-[9px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded shrink-0">
                              {prop.type}
                            </span>
                          </div>
                          
                          <div className="mt-3">
                            {prop.type === "Boolean" ? (
                              <select
                                value={prop.value.toLowerCase()}
                                onChange={(e) => updateConfigValue(sIdx, pIdx, e.target.value)}
                                className="w-full sm:w-48 px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                              >
                                <option value="true">True</option>
                                <option value="false">False</option>
                              </select>
                            ) : prop.type === "Int32" ? (
                              <input
                                type="number"
                                value={prop.value}
                                onChange={(e) => updateConfigValue(sIdx, pIdx, e.target.value)}
                                className="w-full sm:w-48 px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                              />
                            ) : (
                              <input
                                type="text"
                                value={prop.value}
                                onChange={(e) => updateConfigValue(sIdx, pIdx, e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-5 border-t border-white/10 bg-slate-900/50 flex justify-end gap-3 rounded-b-2xl">
              <button
                onClick={() => setConfigModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={configLoading || configSaving}
                className="px-6 py-2 rounded-lg bg-accentPurple hover:bg-accentPurpleHover text-sm font-bold text-white transition-colors disabled:opacity-50"
              >
                {configSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
