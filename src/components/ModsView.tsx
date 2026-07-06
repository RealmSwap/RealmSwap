"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Wrench,
  Sparkles,
  Plus,
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
  Package,
  Star,
  Filter,
  ExternalLink,
  Crown,
  TrendingUp,
  ChevronDown,
  X,
  Globe,
  Tag,
  Layers,
  Trash,
} from "lucide-react";

/* ─── Types ────────────────────────────────────────────────────── */

interface ModsViewProps {
  servers: any[];
  user: any;
}

type TabId = "discover" | "browse" | "installed";

/* ─── Game Themes (mirrors builtins.ts colour tokens) ──────────── */

const GAME_THEMES: Record<
  string,
  {
    gradient: string;
    bg: string;
    border: string;
    text: string;
    icon: string;
    providerName: string;
  }
> = {
  MINECRAFT: {
    gradient: "from-green-500 to-emerald-700",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-400",
    icon: "⛏️",
    providerName: "Modrinth",
  },
  VALHEIM: {
    gradient: "from-amber-500 to-amber-700",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    icon: "⛵",
    providerName: "Thunderstore",
  },
  ZOMBOID: {
    gradient: "from-red-500 to-rose-700",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    icon: "🧟",
    providerName: "Steam Workshop",
  },
  PALWORLD: {
    gradient: "from-orange-500 to-rose-700",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-400",
    icon: "🦊",
    providerName: "Thunderstore",
  },
  VRISING: {
    gradient: "from-purple-500 to-red-800",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    icon: "🧛",
    providerName: "Thunderstore",
  },
  ARK: {
    gradient: "from-cyan-500 to-blue-700",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    text: "text-cyan-400",
    icon: "🦖",
    providerName: "Steam Workshop",
  },
  ENSHROUDED: {
    gradient: "from-blue-500 to-indigo-700",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    icon: "🔥",
    providerName: "—",
  },
  TERRARIA: {
    gradient: "from-lime-500 to-green-700",
    bg: "bg-lime-500/10",
    border: "border-lime-500/30",
    text: "text-lime-400",
    icon: "🌳",
    providerName: "—",
  },
  RUST: {
    gradient: "from-stone-500 to-red-800",
    bg: "bg-stone-500/10",
    border: "border-stone-500/30",
    text: "text-stone-400",
    icon: "⚙️",
    providerName: "—",
  },
  SATISFACTORY: {
    gradient: "from-orange-500 to-amber-700",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-400",
    icon: "🏭",
    providerName: "—",
  },
  WINDROSE: {
    gradient: "from-teal-500 to-cyan-700",
    bg: "bg-teal-500/10",
    border: "border-teal-500/30",
    text: "text-teal-400",
    icon: "🧭",
    providerName: "—",
  },
};

/* ─── Curated Recommended Mods ────────────────────────────────── */

const RECOMMENDED_MODS: Record<string, any[]> = {
  MINECRAFT: [
    {
      name: "Lithium (Fabric)",
      type: "Core Optimization",
      desc: "General-purpose physics, chunk-loading, and AI pathfinding performance enhancer.",
      downloadUrl:
        "https://cdn.modrinth.com/user/AANobbMI/mods/lithium/versions/mc1.20.4-0.12.1/lithium-fabric-mc1.20.4-0.12.1.jar",
      modId: "lithium-fabric",
    },
    {
      name: "FerriteCore (Fabric)",
      type: "RAM Optimizer",
      desc: "Significantly reduces server-side memory footprint (saves up to 2 GB RAM).",
      downloadUrl:
        "https://cdn.modrinth.com/user/OVuP18nd/mods/ferritecore/versions/6.0.3-fabric/ferritecore-6.0.3-fabric.jar",
      modId: "ferritecore-fabric",
    },
    {
      name: "ViaVersion (API)",
      type: "Compatibility",
      desc: "Allows players on newer/older client versions to connect to your server.",
      downloadUrl:
        "https://github.com/ViaVersion/ViaVersion/releases/download/4.9.3/ViaVersion-4.9.3.jar",
      modId: "ViaVersion",
    },
    {
      name: "Geyser (Standalone)",
      type: "Cross-Platform",
      desc: "Lets Bedrock Edition players join your Java Edition server seamlessly.",
      modId: "geyser-standalone",
    },
    {
      name: "Chunky",
      type: "World Pre-gen",
      desc: "Pre-generates chunks around spawn to eliminate lag spikes for new players exploring.",
      modId: "chunky",
    },
    {
      name: "Spark",
      type: "Performance Profiler",
      desc: "Real-time TPS, memory, and CPU profiler for diagnosing server performance bottlenecks.",
      modId: "spark",
    },
  ],
  VALHEIM: [
    {
      name: "BepInEx Loader Pack",
      type: "Mod Core",
      desc: "The essential BepInEx modding framework required to load DLL plugins on your server.",
      modType: "BEPINEX",
      modId: "BepInExPack",
    },
    {
      name: "Valheim Plus Plugin",
      type: "Plugin",
      desc: "Configurable stamina tweaks, build sharing, inventory size modifiers, and server UI indicators.",
      downloadUrl:
        "https://github.com/valheimPlus/ValheimPlus/releases/download/0.9.9.11/ValheimPlus.dll",
      modId: "ValheimPlus",
    },
    {
      name: "Jötunn (Mod Framework)",
      type: "Mod Framework",
      desc: "Library that mod authors use to add custom items, recipes, and game systems to Valheim.",
      modId: "Jotunn",
    },
    {
      name: "Plant Everything",
      type: "Gameplay",
      desc: "Allows planting nearly every type of flora — berry bushes, mushrooms, saplings, and more.",
      modId: "PlantEverything",
    },
    {
      name: "Epic Loot",
      type: "Content",
      desc: "Adds a full loot rarity system with magic items, set bonuses, and enchanting mechanics.",
      modId: "EpicLoot",
    },
  ],
  ZOMBOID: [
    {
      name: "Common Sense",
      type: "QoL",
      desc: "Allows using crowbars to open doors, opening cans with screwdrivers, and basic quality-of-life items.",
      workshopId: "2875848298",
      modId: "BB_CommonSense",
    },
    {
      name: "Filibuster Rhymes' Used Cars!",
      type: "Vehicles",
      desc: "Injects dozens of lore-friendly 80s/90s vehicles, trucks, and vans into spawn tables.",
      workshopId: "1896907770",
      modId: "FRUsedCars",
    },
    {
      name: "Arsenal(26) GunFighter",
      type: "Weapons",
      desc: "Adds 100+ firearms with realistic sounds, animations, and attachments.",
      workshopId: "2904920898",
      modId: "A26_GunFighter",
    },
    {
      name: "Authentic Z",
      type: "Overhaul",
      desc: "Complete zombie overhaul with new animations, skins, and behavior for a more immersive experience.",
      workshopId: "2392987599",
      modId: "AuthenticZ",
    },
    {
      name: "Brita's Weapons Pack",
      type: "Weapons",
      desc: "Massive weapons pack adding hundreds of guns, melee weapons, and accessories to the game world.",
      workshopId: "2200148440",
      modId: "Brita",
    },
  ],
  PALWORLD: [
    {
      name: "BepInEx Pack for Palworld",
      type: "Mod Core",
      desc: "The essential BepInEx modding framework for loading Palworld server plugins.",
      modType: "BEPINEX",
      modId: "BepInExPack_Palworld",
    },
    {
      name: "Pal Edit",
      type: "Utility",
      desc: "Save editor utility that lets admins modify Pal stats, levels, and abilities on the server.",
      modId: "PalEdit",
    },
    {
      name: "Faster Breeding",
      type: "Gameplay",
      desc: "Reduces breeding timers and egg hatch times with configurable multipliers.",
      modId: "FasterBreeding",
    },
  ],
  VRISING: [
    {
      name: "BepInEx Pack for V Rising",
      type: "Mod Core",
      desc: "The essential BepInEx modding framework required for V Rising server plugins.",
      modType: "BEPINEX",
      modId: "BepInExPack_VRising",
    },
    {
      name: "Bloody Merchant",
      type: "Economy",
      desc: "Adds an in-game merchant NPC that players can trade with using configurable item prices.",
      modId: "BloodyMerchant",
    },
  ],
};

/* ─── Helpers ─────────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatCount(n: number | undefined): string {
  if (n === undefined || n === null) return "";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

/* ─── Component ───────────────────────────────────────────────── */

export default function ModsView({ servers, user }: ModsViewProps) {
  const router = useRouter();

  /* Server & global state */
  const [selectedServer, setSelectedServer] = useState<any | null>(
    servers[0] || null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [installedMods, setInstalledMods] = useState<any[]>([]);

  /* Tabs */
  const [activeTab, setActiveTab] = useState<TabId>("discover");

  /* Search / Browse state */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState("relevance");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [browseOffset, setBrowseOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  /* Detail modal */
  const [detailMod, setDetailMod] = useState<any | null>(null);

  /* Config modal (existing) */
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configTargetMod, setConfigTargetMod] = useState<any | null>(null);
  const [configSections, setConfigSections] = useState<any[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  /* Zomboid Workshop form */
  const [customWorkshopId, setCustomWorkshopId] = useState("");
  const [customModId, setCustomModId] = useState("");

  /* Dependency modal */
  const [depModalOpen, setDepModalOpen] = useState(false);
  const [depModalMod, setDepModalMod] = useState<any | null>(null);
  const [depModalDeps, setDepModalDeps] = useState<any[]>([]);
  const [depModalSelected, setDepModalSelected] = useState<Set<string>>(new Set());
  const [resolvingDeps, setResolvingDeps] = useState(false);

  /* ── Derived ─────────────────────────────────────────────────── */

  const game = selectedServer?.game?.toUpperCase();
  const recommended = game ? RECOMMENDED_MODS[game] || [] : [];
  const theme = game ? GAME_THEMES[game] || null : null;

  /** Set of installed packageIds for fast "already installed" checks */
  const installedIds = useMemo(
    () => new Set(installedMods.map((m) => m.packageId)),
    [installedMods]
  );
  const isInstalled = (id: string) => installedIds.has(id);

  /** Whether the game supports live mod browsing */
  const supportsSearch =
    game === "VALHEIM" ||
    game === "MINECRAFT" ||
    game === "ZOMBOID" ||
    game === "PALWORLD" ||
    game === "VRISING";

  /** Dynamic category list from current results */
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    const pool = searchResults;
    pool.forEach((m: any) =>
      m.categories?.forEach((c: string) => cats.add(c))
    );
    return Array.from(cats).sort();
  }, [searchResults]);

  /* ── Effects ─────────────────────────────────────────────────── */

  /** Fetch installed mods when server changes */
  React.useEffect(() => {
    if (selectedServer) {
      fetch(`/api/servers/${selectedServer.id}/mods`)
        .then((res) => res.json())
        .then((data) => {
          if (data.mods) setInstalledMods(data.mods);
        })
        .catch((err) => console.error(err));
    } else {
      setInstalledMods([]);
      setSearchResults([]);
      setSearchQuery("");
    }
  }, [selectedServer]);

  /** Debounced search (Browse tab) */
  React.useEffect(() => {
    if (!selectedServer) {
      setSearchResults([]);
      setHasMore(true);
      return;
    }

    setIsSearching(true);
    setBrowseOffset(0);
    const delayDebounceFn = setTimeout(() => {
      const params = new URLSearchParams({
        q: searchQuery,
        offset: "0",
        sort: sortBy,
        ...(selectedCategory && { category: selectedCategory }),
      });
      fetch(
        `/api/servers/${selectedServer.id}/mods/search?${params.toString()}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.results) {
            setSearchResults(data.results);
            setHasMore(data.results.length >= 20);
          }
        })
        .catch((err) => console.error("Search failed:", err))
        .finally(() => setIsSearching(false));
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedServer, sortBy, selectedCategory]);

  /* ── Handlers ────────────────────────────────────────────────── */

  const handlePreInstallMod = async (mod: any) => {
    if (!selectedServer) return;
    
    // Only Thunderstore & Modrinth support resolving dependencies right now
    if (mod.provider === "thunderstore" || mod.provider === "modrinth") {
      setResolvingDeps(true);
      try {
        const res = await fetch(`/api/servers/${selectedServer.id}/mods/${mod.packageId || mod.modId}/dependencies?provider=${mod.provider}&version=${mod.version || "latest"}`);
        const data = await res.json();
        if (data.dependencies && data.dependencies.length > 0) {
          setDepModalMod(mod);
          setDepModalDeps(data.dependencies);
          
          // Pre-select dependencies that are NOT already installed
          const selected = new Set<string>();
          data.dependencies.forEach((d: any) => {
            if (!isInstalled(d.packageId)) {
              selected.add(d.packageId);
            }
          });
          setDepModalSelected(selected);
          setDepModalOpen(true);
        } else {
          // No dependencies, just install
          handleInstallMod(mod);
        }
      } catch (err) {
        console.error("Failed to resolve dependencies", err);
        handleInstallMod(mod); // fallback
      } finally {
        setResolvingDeps(false);
      }
    } else {
      handleInstallMod(mod);
    }
  };

  const handleBulkInstall = async () => {
    if (!depModalMod || !selectedServer) return;
    
    setDepModalOpen(false);
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    const modsToInstall = depModalDeps.filter(d => depModalSelected.has(d.packageId));
    // The main mod itself doesn't need to be in depModalDeps, we add it at the end
    // But we must construct it properly
    modsToInstall.push(depModalMod);
    
    let installedCount = 0;
    try {
      for (const m of modsToInstall) {
        const res = await fetch(`/api/servers/${selectedServer.id}/mods/install`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modType: m.modType || "PLUGIN",
            modId: m.packageId || m.modId,
            modName: m.name,
            downloadUrl: m.downloadUrl,
            workshopId: m.workshopId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`Failed to install ${m.name}: ${data.error}`);
        installedCount++;
      }
      setSuccess(`Successfully installed ${installedCount} mods!`);
      
      // Refresh
      const modsRes = await fetch(`/api/servers/${selectedServer.id}/mods`);
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setDepModalMod(null);
      setDepModalDeps([]);
      setDepModalSelected(new Set());
    }
  };

  const handleDeleteMod = async (mod: any) => {
    if (!selectedServer) return;
    if (!confirm(`Are you sure you want to uninstall ${mod.name}?`)) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/${mod.packageId || mod.modId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to uninstall mod");

      setSuccess(`Successfully uninstalled ${mod.name}`);
      
      // Refresh
      const modsRes = await fetch(`/api/servers/${selectedServer.id}/mods`);
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallMod = async (mod: {
    modId: string;
    name: string;
    downloadUrl?: string;
    modType?: string;
    workshopId?: string;
  }) => {
    if (!selectedServer) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `/api/servers/${selectedServer.id}/mods/install`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modType: mod.modType || "PLUGIN",
            modId: mod.modId,
            modName: mod.name,
            downloadUrl: mod.downloadUrl,
            workshopId: mod.workshopId,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to install mod");

      setSuccess(
        `Successfully installed '${mod.name}' to server '${selectedServer.name}'!`
      );
      // Refresh installed mods
      const modsRes = await fetch(
        `/api/servers/${selectedServer.id}/mods`
      );
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!selectedServer || !supportsSearch) return;
    const newOffset = browseOffset + 20;
    setIsSearching(true);

    const params = new URLSearchParams({
      q: searchQuery,
      offset: String(newOffset),
      sort: sortBy,
      ...(selectedCategory && { category: selectedCategory }),
    });

    try {
      const res = await fetch(
        `/api/servers/${selectedServer.id}/mods/search?${params.toString()}`
      );
      const data = await res.json();
      if (data.results) {
        setSearchResults((prev) => [...prev, ...data.results]);
        setBrowseOffset(newOffset);
        setHasMore(data.results.length >= 20);
      }
    } catch (err) {
      console.error("Load more failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleExportCollection = () => {
    if (!selectedServer) return;
    window.open(
      `/api/servers/${selectedServer.id}/mods/export`,
      "_blank"
    );
  };

  const handleImportCollection = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (
      !selectedServer ||
      !e.target.files ||
      e.target.files.length === 0
    )
      return;
    const file = e.target.files[0];

    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("collection", file);

    try {
      const res = await fetch(
        `/api/servers/${selectedServer.id}/mods/import`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to import collection");

      setSuccess(data.message || "Collection imported successfully!");
      const modsRes = await fetch(
        `/api/servers/${selectedServer.id}/mods`
      );
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }

    e.target.value = "";
  };

  const handleZomboidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customWorkshopId || !customModId) return;
    handlePreInstallMod({
      name: `Workshop ID ${customWorkshopId} (${customModId})`,
      modId: customModId,
      workshopId: customWorkshopId,
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
      const res = await fetch(
        `/api/servers/${selectedServer.id}/mods/${mod.id}/config`
      );
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
      const res = await fetch(
        `/api/servers/${selectedServer.id}/mods/${configTargetMod.id}/config`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections: configSections }),
        }
      );
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

  const updateConfigValue = (
    sectionIdx: number,
    propIdx: number,
    newValue: string
  ) => {
    const newSections = [...configSections];
    newSections[sectionIdx].properties[propIdx].value = newValue;
    setConfigSections(newSections);
  };

  /* ── Display mods for Browse tab ─────────────────────────────── */

  const displayMods = searchResults;

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
            <span>Mod &amp; Plugin Manager</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">
            Configure loaders, inject plugins, and sync Steam Workshop mods
            with a single click.
          </p>
        </div>

        {/* Server Selector Bar */}
        <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-1">
              Active Server Target
            </span>
            <span className="text-[11px] text-mutedText">
              Select which local game server to manage.
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Game icon badge */}
            {theme && (
              <span className="text-2xl" title={game}>
                {theme.icon}
              </span>
            )}

            <div className="min-w-[200px]">
              {servers.length === 0 ? (
                <span className="text-xs text-red-400 font-bold">
                  No servers deployed yet
                </span>
              ) : (
                <select
                  value={selectedServer?.id || ""}
                  onChange={(e) => {
                    const s = servers.find(
                      (srv) => srv.id === e.target.value
                    );
                    setSelectedServer(s || null);
                    setError(null);
                    setSuccess(null);
                    setSearchQuery("");
                    setSearchResults([]);
                    setPopularMods([]);
                    setBrowseOffset(0);
                    setActiveTab("discover");
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.game})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3 animate-slide-down">
            <Info className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400/60 hover:text-red-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="p-4 mb-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-3 animate-slide-down">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
            <button
              onClick={() => setSuccess(null)}
              className="ml-auto text-emerald-400/60 hover:text-emerald-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Running server warning */}
        {selectedServer?.status === "RUNNING" && (
          <div className="p-4 mb-6 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex gap-2.5 leading-normal animate-slide-down">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="font-bold block">Server Is Running — Installs Locked</span>
              <span>
                Please stop the server from the dashboard before installing
                or configuring mods. Modifying running files leads to save
                corruption.
              </span>
            </div>
          </div>
        )}

        {/* Main content */}
        {!selectedServer ? (
          <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center bg-slate-950/20">
            <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span className="font-bold text-sm block text-slate-400">
              No Servers Found
            </span>
            <p className="text-xs text-mutedText max-w-sm mx-auto mt-1">
              Please deploy your first local dedicated server from the
              Dashboard to start installing mods.
            </p>
          </div>
        ) : (
          <>
            {/* ─── Tab Bar ────────────────────────────────────── */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/50 border border-white/5 mb-6 w-fit">
              {(
                [
                  { id: "discover" as TabId, label: "Discover", Icon: Sparkles },
                  { id: "browse" as TabId, label: "Browse", Icon: Search },
                  {
                    id: "installed" as TabId,
                    label: "Installed",
                    Icon: Package,
                    count: installedMods.length,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? "bg-accentPurple text-white shadow-lg shadow-accentPurple/25"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <tab.Icon className="w-4 h-4" />
                  {tab.label}
                  {"count" in tab && tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                        activeTab === tab.id
                          ? "bg-white/20"
                          : "bg-white/10"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ─── DISCOVER TAB ──────────────────────────────── */}
            {activeTab === "discover" && (
              <div className="space-y-8 animate-fade-in">
                {/* Staff Picks */}
                {recommended.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Crown className="w-5 h-5 text-amber-400" />
                      <h3 className="font-extrabold text-lg text-white">
                        Staff Picks
                      </h3>
                      <span
                        className={`text-xs ${theme?.text || "text-slate-400"} font-bold`}
                      >
                        for {selectedServer.game}
                      </span>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x snap-mandatory">
                      {recommended.map((mod, idx) => (
                        <div
                          key={idx}
                          className={`flex-shrink-0 w-72 p-5 rounded-2xl border ${theme?.border || "border-white/10"} ${theme?.bg || "bg-white/5"} backdrop-blur-sm relative overflow-hidden group transition-transform hover:scale-[1.02] snap-start`}
                          style={{
                            animationDelay: `${idx * 80}ms`,
                            animationFillMode: "backwards",
                          }}
                        >
                          {/* Background gradient shimmer */}
                          <div
                            className={`absolute inset-0 bg-gradient-to-br ${theme?.gradient || "from-slate-500 to-slate-700"} opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500`}
                          />

                          <div className="relative z-10 flex flex-col h-full">
                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-wider ${theme?.text || "text-slate-400"}`}
                            >
                              {mod.type}
                            </span>
                            <h4 className="font-extrabold text-base text-white mt-1.5 leading-tight">
                              {mod.name}
                            </h4>
                            <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed flex-1">
                              {mod.desc}
                            </p>

                            <div className="mt-4 flex items-center justify-between">
                              {isInstalled(mod.modId) ? (
                                <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                                  <Check className="w-4 h-4" /> Installed
                                </span>
                              ) : (
                                <button
                                  onClick={() => handlePreInstallMod(mod)}
                                  disabled={
                                    loading ||
                                    selectedServer.status === "RUNNING"
                                  }
                                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Quick Install
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Trending mods */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-accentPurple" />
                    <h3 className="font-extrabold text-lg text-white">
                      Trending
                    </h3>
                    {theme?.providerName && theme.providerName !== "—" && (
                      <span className="text-xs text-mutedText">
                        on {theme.providerName}
                      </span>
                    )}
                  </div>

                  {!supportsSearch ? (
                    <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center">
                      <Globe className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                      <span className="font-bold text-sm block text-slate-400">
                        Mod browsing isn&apos;t available for{" "}
                        {selectedServer.game} yet
                      </span>
                      <p className="text-xs text-mutedText max-w-sm mx-auto mt-1.5">
                        Check the{" "}
                        <Link
                          href="/dashboard"
                          className="text-accentPurple hover:underline"
                        >
                          Marketplace
                        </Link>{" "}
                        for community server templates that include
                        pre-configured mods.
                      </p>
                    </div>
                  ) : isSearching && popularMods.length === 0 ? (
                    <div className="flex justify-center p-12">
                      <Loader2 className="w-8 h-8 text-accentPurple animate-spin" />
                    </div>
                  ) : popularMods.length === 0 ? (
                    <div className="glass-panel rounded-2xl border border-dashed border-white/5 p-8 text-center">
                      <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <span className="text-sm text-mutedText">
                        No trending mods available right now.
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {popularMods.map((mod, idx) => (
                        <ModCard
                          key={idx}
                          mod={mod}
                          game={game}
                          loading={loading}
                          serverStatus={selectedServer.status}
                          isInstalled={isInstalled(mod.packageId)}
                          onInstall={handleInstallMod}
                          onDetail={setDetailMod}
                          animationDelay={idx * 50}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* Usage Guidelines (right column on desktop) */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2" />
                  <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-3">
                    <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block">
                      Usage Guidelines
                    </span>
                    <div className="text-xs text-slate-400 leading-normal space-y-3">
                      <p>
                        💡 <strong>Fabric/Forge support:</strong> For Minecraft,
                        make sure you install a fabric-compatible loader JAR or
                        download Fabric plugins if you use Paper/Spigot.
                      </p>
                      <p>
                        🛠️ <strong>BepInEx requirement:</strong> Valheim plugins
                        require BepInEx to load DLL files. Make sure you install
                        the BepInEx Loader Pack first.
                      </p>
                      <p>
                        📁 <strong>File locations:</strong> Mods are stored
                        inside the <code>local-servers/[id]</code> folder. You
                        can add custom DLLs or JARs manually by opening your
                        project directory on disk.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* ─── BROWSE TAB ────────────────────────────────── */}
            {activeTab === "browse" && (
              <div className="animate-fade-in">
                {!supportsSearch ? (
                  <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center">
                    <Globe className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <span className="font-bold text-sm block text-slate-400">
                      Mod browsing isn&apos;t available for{" "}
                      {selectedServer.game} yet
                    </span>
                    <p className="text-xs text-mutedText max-w-sm mx-auto mt-1.5">
                      Check the{" "}
                      <Link
                        href="/dashboard"
                        className="text-accentPurple hover:underline"
                      >
                        Marketplace
                      </Link>{" "}
                      for community server templates that include
                      pre-configured mods.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-6">
                    {/* Filter Sidebar */}
                    <aside className="hidden lg:block w-56 flex-shrink-0 space-y-4">
                      {/* Sort */}
                      <div className="glass-panel rounded-xl border border-white/5 p-4">
                        <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-2.5">
                          Sort By
                        </span>
                        <select
                          value={sortBy}
                          onChange={(e) => {
                            setSortBy(e.target.value);
                            setBrowseOffset(0);
                          }}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
                        >
                          <option value="relevance">Relevance</option>
                          <option value="downloads">Most Downloads</option>
                          <option value="rating">Highest Rated</option>
                          <option value="updated">Recently Updated</option>
                        </select>
                      </div>

                      {/* Categories */}
                      {availableCategories.length > 0 && (
                        <div className="glass-panel rounded-xl border border-white/5 p-4">
                          <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-2.5">
                            <Tag className="w-3 h-3 inline mr-1" />
                            Categories
                          </span>
                          <div className="space-y-0.5 max-h-64 overflow-y-auto">
                            <button
                              onClick={() => setSelectedCategory("")}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                selectedCategory === ""
                                  ? "bg-accentPurple/20 text-accentPurple"
                                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                              }`}
                            >
                              All Categories
                            </button>
                            {availableCategories.map((cat) => (
                              <button
                                key={cat}
                                onClick={() =>
                                  setSelectedCategory(
                                    selectedCategory === cat ? "" : cat
                                  )
                                }
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                                  selectedCategory === cat
                                    ? "bg-accentPurple/20 text-accentPurple"
                                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Provider info */}
                      <div className="glass-panel rounded-xl border border-white/5 p-4">
                        <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-2">
                          <Layers className="w-3 h-3 inline mr-1" />
                          Source
                        </span>
                        <div
                          className={`px-3 py-2 rounded-lg ${theme?.bg || "bg-white/5"} ${theme?.border || "border-white/10"} border text-xs font-bold ${theme?.text || "text-slate-300"}`}
                        >
                          {theme?.providerName || "Unknown"}
                        </div>
                      </div>
                    </aside>

                    {/* Results area */}
                    <div className="flex-1 min-w-0 space-y-4">
                      {/* Search bar */}
                      <div className="glass-panel rounded-xl border border-white/5 p-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="relative flex-1">
                            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              placeholder={`Search ${theme?.providerName || "mods"}...`}
                              value={searchQuery}
                              onChange={(e) =>
                                setSearchQuery(e.target.value)
                              }
                              className="pl-9 pr-4 py-2.5 text-sm rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors w-full"
                            />
                            {isSearching && (
                              <Loader2 className="w-4 h-4 text-accentPurple absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
                            )}
                          </div>

                          {/* Mobile sort (lg hidden by sidebar) */}
                          <select
                            value={sortBy}
                            onChange={(e) => {
                              setSortBy(e.target.value);
                              setBrowseOffset(0);
                            }}
                            className="lg:hidden px-3 py-2.5 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple cursor-pointer font-bold"
                          >
                            <option value="relevance">Relevance</option>
                            <option value="downloads">
                              Most Downloads
                            </option>
                            <option value="rating">Highest Rated</option>
                            <option value="updated">
                              Recently Updated
                            </option>
                          </select>
                        </div>

                        {/* Active filters indicator */}
                        {selectedCategory && (
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                            <Filter className="w-3 h-3 text-mutedText" />
                            <span className="text-[10px] text-mutedText font-bold uppercase">
                              Filtered:
                            </span>
                            <button
                              onClick={() => setSelectedCategory("")}
                              className="flex items-center gap-1 px-2 py-0.5 rounded bg-accentPurple/20 text-accentPurple text-[10px] font-bold hover:bg-accentPurple/30 transition-colors capitalize"
                            >
                              {selectedCategory}
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Zomboid Workshop Form */}
                      {game === "ZOMBOID" && (
                        <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-3">
                          <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                            <Plus className="w-4 h-4 text-emerald-400" />
                            Custom Workshop Mod
                          </h4>
                          <p className="text-[11px] text-mutedText">
                            Don&apos;t see your mod above? Enter a Workshop
                            ID and Mod ID manually.
                          </p>
                          <form
                            onSubmit={handleZomboidSubmit}
                            className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
                          >
                            <div>
                              <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1">
                                Workshop ID
                              </label>
                              <input
                                type="text"
                                value={customWorkshopId}
                                onChange={(e) =>
                                  setCustomWorkshopId(e.target.value)
                                }
                                placeholder="e.g. 2875848298"
                                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                                required
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1">
                                Mod Identifier
                              </label>
                              <input
                                type="text"
                                value={customModId}
                                onChange={(e) =>
                                  setCustomModId(e.target.value)
                                }
                                placeholder="e.g. BB_CommonSense"
                                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                                required
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={
                                loading ||
                                selectedServer.status === "RUNNING"
                              }
                              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
                            >
                              Add Workshop Mod
                            </button>
                          </form>
                        </div>
                      )}

                      {/* Results grid */}
                      {searchQuery.trim().length > 0 &&
                      searchResults.length === 0 &&
                      !isSearching ? (
                        <div className="glass-panel rounded-2xl border border-dashed border-white/5 p-8 text-center">
                          <Search className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                          <span className="text-sm text-slate-400 font-bold block">
                            No results for &ldquo;{searchQuery}&rdquo;
                          </span>
                          <p className="text-xs text-mutedText mt-1">
                            Try a different search term or clear filters.
                          </p>
                        </div>
                      ) : (
                        <>
                          <p className="text-[11px] text-mutedText font-medium">
                            {searchQuery.trim()
                              ? `Search results for "${searchQuery}"`
                              : `Popular mods on ${theme?.providerName || "this platform"}`}
                            {displayMods.length > 0 &&
                              ` · ${displayMods.length} shown`}
                          </p>

                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {displayMods.map((mod, idx) => (
                              <ModCard
                                key={`${mod.packageId}-${idx}`}
                                mod={mod}
                                game={game}
                                loading={loading}
                                serverStatus={selectedServer.status}
                                isInstalled={isInstalled(mod.packageId)}
                                onInstall={handleInstallMod}
                                onDetail={setDetailMod}
                                animationDelay={idx * 30}
                              />
                            ))}
                          </div>

                          {/* Load More */}
                          {hasMore && displayMods.length >= 20 && (
                            <div className="flex justify-center pt-4">
                              <button
                                onClick={handleLoadMore}
                                disabled={isSearching}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-slate-300 transition-colors disabled:opacity-50"
                              >
                                {isSearching ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading…
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-4 h-4" />
                                    Load More
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── INSTALLED TAB ─────────────────────────────── */}
            {activeTab === "installed" && (
              <div className="space-y-4 animate-fade-in">
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h3 className="font-extrabold text-lg text-white">
                      Installed Mods
                    </h3>
                    <span className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-bold text-slate-300">
                      {installedMods.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 text-xs font-bold text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import Collection</span>
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportCollection}
                        disabled={
                          loading ||
                          selectedServer.status === "RUNNING"
                        }
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
                  <div className="glass-panel rounded-2xl border border-dashed border-white/5 p-12 text-center">
                    <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <span className="font-bold text-sm block text-slate-400">
                      No mods installed yet
                    </span>
                    <p className="text-xs text-mutedText max-w-sm mx-auto mt-1.5">
                      Head to the{" "}
                      <button
                        onClick={() => setActiveTab("discover")}
                        className="text-accentPurple hover:underline font-bold"
                      >
                        Discover
                      </button>{" "}
                      or{" "}
                      <button
                        onClick={() => setActiveTab("browse")}
                        className="text-accentPurple hover:underline font-bold"
                      >
                        Browse
                      </button>{" "}
                      tab to find and install mods.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {installedMods.map((mod: any, idx: number) => (
                      <div
                        key={mod.id}
                        className="p-4 rounded-xl border border-white/5 bg-slate-950/40 hover:border-white/10 transition-all group"
                        style={{
                          animationDelay: `${idx * 40}ms`,
                          animationFillMode: "backwards",
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {/* Placeholder icon */}
                          <div className="w-10 h-10 rounded-lg bg-accentPurple/10 flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-accentPurple/60" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4
                                className="font-extrabold text-sm text-slate-100 truncate"
                                title={mod.name}
                              >
                                {mod.name}
                              </h4>
                              <span className="text-[9px] text-mutedText font-mono flex-shrink-0">
                                {mod.version}
                              </span>
                            </div>
                            <p className="text-[10px] text-mutedText truncate font-mono mt-0.5">
                              {mod.packageId}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-extrabold uppercase tracking-wide">
                              {mod.provider}
                            </span>
                            {mod.installedAt && (
                              <span className="text-[9px] text-mutedText flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {timeAgo(mod.installedAt)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeleteMod(mod)}
                              disabled={loading || selectedServer.status === "RUNNING"}
                              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs font-bold text-red-500 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Trash className="w-3 h-3" />
                              Uninstall
                            </button>
                            <button
                              onClick={() => handleConfigureClick(mod)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                            >
                              <Settings className="w-3 h-3" />
                              Configure
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ─── Mod Detail Modal ──────────────────────────────────── */}
      {detailMod && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setDetailMod(null)}
        >
          <div
            className="bg-[#0f111a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-slide-down"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10">
              <div className="flex items-start gap-4">
                {detailMod.iconUrl ? (
                  <img
                    src={detailMod.iconUrl}
                    alt=""
                    className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-slate-800"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-accentPurple/20 flex items-center justify-center flex-shrink-0">
                    <Package className="w-8 h-8 text-accentPurple" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-xl text-white leading-tight">
                    {detailMod.name}
                  </h3>
                  <p className="text-sm text-mutedText mt-0.5">
                    by {detailMod.author}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    {detailMod.downloads !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-mutedText">
                        <Download className="w-3 h-3" />{" "}
                        {formatCount(detailMod.downloads)}
                      </span>
                    )}
                    {detailMod.rating !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-mutedText">
                        <Star className="w-3 h-3" /> {detailMod.rating}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-accentPurple/20 text-accentPurple font-bold text-[10px] uppercase">
                      {detailMod.provider}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDetailMod(null)}
                  className="text-slate-400 hover:text-white transition-colors p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              <p className="text-sm text-slate-300 leading-relaxed">
                {detailMod.description}
              </p>

              {/* Categories */}
              {detailMod.categories?.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1.5">
                    Categories
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {detailMod.categories.map((cat: string) => (
                      <span
                        key={cat}
                        className="px-2.5 py-1 rounded-lg bg-white/5 text-xs text-slate-300 font-medium capitalize"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Version & Update info */}
              <div className="p-3.5 rounded-xl bg-slate-900/50 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block">
                    Latest Version
                  </span>
                  <span className="text-sm text-white font-mono">
                    v{detailMod.version}
                  </span>
                </div>
                {detailMod.updatedAt && (
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block">
                      Updated
                    </span>
                    <span className="text-xs text-slate-300">
                      {timeAgo(detailMod.updatedAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/10 bg-slate-900/30 flex items-center justify-between rounded-b-2xl">
              {detailMod.websiteUrl ? (
                <a
                  href={detailMod.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accentPurple hover:underline flex items-center gap-1.5 font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View on {detailMod.provider}
                </a>
              ) : (
                <div />
              )}

              {isInstalled(detailMod.packageId) ? (
                <span className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                  <Check className="w-4 h-4" /> Already Installed
                </span>
              ) : (
                <button
                  onClick={() => {
                    handlePreInstallMod({
                      name: detailMod.name,
                      modId: detailMod.packageId,
                      downloadUrl: detailMod.downloadUrl,
                      modType:
                        game === "VALHEIM" ? "PLUGIN" : undefined,
                    });
                    setDetailMod(null);
                  }}
                  disabled={
                    loading || selectedServer?.status === "RUNNING"
                  }
                  className="px-6 py-2.5 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-sm font-bold text-white transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Install Mod
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Dependency Modal ─────────────────────────────── */}
      {depModalOpen && depModalMod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0b101a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-up">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Missing Dependencies</h3>
                  <p className="text-xs text-mutedText mt-0.5">
                    {depModalMod.name} requires additional mods to function properly.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setDepModalOpen(false);
                  setDepModalMod(null);
                  setDepModalDeps([]);
                }}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-950/30">
              <div className="space-y-3">
                {depModalDeps.map((dep, idx) => {
                  const alreadyInstalled = isInstalled(dep.packageId);
                  const isChecked = depModalSelected.has(dep.packageId);

                  return (
                    <div
                      key={dep.packageId}
                      className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                        alreadyInstalled
                          ? "bg-slate-900/40 border-emerald-500/20 opacity-70"
                          : isChecked
                          ? "bg-blue-500/10 border-blue-500/30"
                          : "bg-slate-900 border-white/5 hover:border-white/10"
                      }`}
                    >
                      <button
                        className="mt-1 flex-shrink-0 focus:outline-none"
                        disabled={alreadyInstalled}
                        onClick={() => {
                          const newSet = new Set(depModalSelected);
                          if (newSet.has(dep.packageId)) {
                            newSet.delete(dep.packageId);
                          } else {
                            newSet.add(dep.packageId);
                          }
                          setDepModalSelected(newSet);
                        }}
                      >
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                            alreadyInstalled
                              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                              : isChecked
                              ? "bg-blue-500 border-blue-500 text-white"
                              : "bg-slate-800 border-slate-600 text-transparent"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-slate-200 truncate">
                            {dep.name}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 whitespace-nowrap">
                            v{dep.version}
                          </span>
                        </div>
                        <p className="text-xs text-mutedText mt-1 line-clamp-1">
                          {dep.description || dep.packageId}
                        </p>
                        {alreadyInstalled && (
                          <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded">
                            <Check className="w-3 h-3" />
                            Already Installed
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 border-t border-white/5 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setDepModalOpen(false);
                  setDepModalMod(null);
                  setDepModalDeps([]);
                }}
                className="px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkInstall}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                Install Selected ({depModalSelected.size} + 1)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Config Modal (existing) ───────────────────────────── */}
      {configModalOpen && configTargetMod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f111a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-slide-down">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-accentPurple" />
                  Configure {configTargetMod.name}
                </h3>
                <p className="text-xs text-mutedText mt-1 font-mono">
                  {configTargetMod.packageId}
                </p>
              </div>
              <button
                onClick={() => setConfigModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {configLoading ? (
                <div className="text-center py-10">
                  <Wrench className="w-8 h-8 text-slate-600 animate-spin mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-400">
                    Parsing configuration files…
                  </p>
                </div>
              ) : configSections.length === 0 ? (
                <div className="text-center py-10 bg-slate-900/50 rounded-xl border border-white/5">
                  <p className="text-sm font-bold text-slate-400">
                    No configuration properties found.
                  </p>
                </div>
              ) : (
                configSections.map((section, sIdx) => (
                  <div key={sIdx} className="space-y-4">
                    <h4 className="font-bold text-sm text-accentPurple border-b border-white/5 pb-2 uppercase tracking-wide">
                      [{section.name}]
                    </h4>
                    <div className="space-y-5">
                      {section.properties.map(
                        (prop: any, pIdx: number) => (
                          <div
                            key={pIdx}
                            className="bg-slate-950/40 p-4 rounded-xl border border-white/5"
                          >
                            <div className="flex justify-between items-start gap-4 mb-2">
                              <div>
                                <label className="text-sm font-bold text-slate-200 block">
                                  {prop.key}
                                </label>
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
                                  onChange={(e) =>
                                    updateConfigValue(
                                      sIdx,
                                      pIdx,
                                      e.target.value
                                    )
                                  }
                                  className="w-full sm:w-48 px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                                >
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                              ) : prop.type === "Int32" ? (
                                <input
                                  type="number"
                                  value={prop.value}
                                  onChange={(e) =>
                                    updateConfigValue(
                                      sIdx,
                                      pIdx,
                                      e.target.value
                                    )
                                  }
                                  className="w-full sm:w-48 px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={prop.value}
                                  onChange={(e) =>
                                    updateConfigValue(
                                      sIdx,
                                      pIdx,
                                      e.target.value
                                    )
                                  }
                                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                                />
                              )}
                            </div>
                          </div>
                        )
                      )}
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
                {configSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

/**
 * Rich mod card used in Browse and Discover grids.
 */
function ModCard({
  mod,
  game,
  loading,
  serverStatus,
  isInstalled,
  onInstall,
  onDetail,
  animationDelay = 0,
}: {
  mod: any;
  game: string;
  loading: boolean;
  serverStatus: string;
  isInstalled: boolean;
  onInstall: (mod: any) => void;
  onDetail: (mod: any) => void;
  animationDelay?: number;
}) {
  return (
    <div
      className="p-4 rounded-xl border border-white/5 bg-slate-950/40 hover:border-white/10 hover:bg-slate-900/40 transition-all cursor-pointer group animate-fade-in"
      style={{
        animationDelay: `${animationDelay}ms`,
        animationFillMode: "backwards",
      }}
      onClick={() => onDetail(mod)}
    >
      {/* Top row: Icon + Title */}
      <div className="flex items-start gap-3">
        {mod.iconUrl ? (
          <img
            src={mod.iconUrl}
            alt=""
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-800 group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-accentPurple/15 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-accentPurple/60" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4
              className="font-extrabold text-sm text-slate-100 truncate group-hover:text-white transition-colors"
              title={mod.name}
            >
              {mod.name}
            </h4>
            <span className="text-[9px] text-mutedText font-mono flex-shrink-0">
              v{mod.version}
            </span>
          </div>
          <p className="text-[10px] text-mutedText truncate">
            by {mod.author}
          </p>
        </div>
      </div>

      {/* Description */}
      <p
        className="text-[11px] text-slate-400 mt-2.5 line-clamp-2 leading-relaxed"
        title={mod.description}
      >
        {mod.description}
      </p>

      {/* Category pills */}
      {mod.categories?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {mod.categories.slice(0, 3).map((cat: string) => (
            <span
              key={cat}
              className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-medium capitalize"
            >
              {cat}
            </span>
          ))}
          {mod.categories.length > 3 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500 font-medium">
              +{mod.categories.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Stats bar + action */}
      <div className="pt-3 border-t border-white/5 mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-mutedText">
          {mod.downloads !== undefined && mod.downloads > 0 && (
            <span className="flex items-center gap-1">
              <Download className="w-3 h-3" />
              {formatCount(mod.downloads)}
            </span>
          )}
          {mod.rating !== undefined && mod.rating > 0 && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" />
              {formatCount(mod.rating)}
            </span>
          )}
          {mod.updatedAt && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(mod.updatedAt)}
            </span>
          )}
        </div>

        {isInstalled ? (
          <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold">
            <Check className="w-3.5 h-3.5" /> Installed
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInstall({
                name: mod.name,
                modId: mod.packageId,
                downloadUrl: mod.downloadUrl,
                modType: game === "VALHEIM" ? "PLUGIN" : undefined,
              });
            }}
            disabled={loading || serverStatus === "RUNNING"}
            className="px-3 py-1.5 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Install
          </button>
        )}
      </div>
    </div>
  );
}
