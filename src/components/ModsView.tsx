"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import { InstallProgressPanel, newInstallId, useModInstallProgress } from "@/components/mods/InstallProgress";
import { toast } from "sonner";
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
  RefreshCw,
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
    providerName: "Modrinth + CurseForge",
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
    providerName: "—",
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
    providerName: "Steam Workshop",
  },
  RUST: {
    gradient: "from-stone-500 to-red-800",
    bg: "bg-stone-500/10",
    border: "border-stone-500/30",
    text: "text-stone-400",
    icon: "⚙️",
    providerName: "uMod (Oxide)",
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
      name: "Jötunn (Mod Framework)",
      type: "Mod Framework",
      desc: "Library that mod authors use to add custom items, recipes, and game systems to Valheim.",
      modId: "ValheimModding-Jotunn",
    },
    {
      name: "Plant Everything",
      type: "Gameplay",
      desc: "Allows planting nearly every type of flora — berry bushes, mushrooms, saplings, and more.",
      modId: "Advize-PlantEverything",
    },
    {
      name: "Epic Loot",
      type: "Content",
      desc: "Adds a full loot rarity system with magic items, set bonuses, and enchanting mechanics.",
      modId: "RandyKnapp-EpicLoot",
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
  TERRARIA: [
    {
      name: "tModLoader",
      type: "Mod Core",
      desc: "The modding runtime Terraria mods run on — required before any mod will load. One-click install, the vanilla world stays put.",
      modType: "TML_LOADER",
    },
    {
      name: "Calamity Mod",
      type: "Content",
      desc: "Huge content expansion: new biomes, 30+ bosses, hundreds of items and a post-Moon Lord progression.",
      workshopId: "2824688072",
    },
    {
      name: "Thorium Mod",
      type: "Content",
      desc: "Large content mod with two new classes, new biomes, bosses, and hundreds of items.",
      workshopId: "2908170107",
    },
    {
      name: "Magic Storage",
      type: "QoL",
      desc: "Networked crafting storage — one remote-access inventory for all your items and crafting stations.",
      workshopId: "2563309347",
    },
    {
      name: "Boss Checklist",
      type: "Utilities",
      desc: "Tracks every boss and event with spawn conditions and progression order.",
      workshopId: "2669644269",
    },
    {
      name: "Recipe Browser",
      type: "Utilities",
      desc: "In-game search for every recipe, item and NPC — the reference tool for modded playthroughs.",
      workshopId: "2619954303",
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
      name: "Bloodcraft",
      type: "Overhaul",
      desc: "Full server-side overhaul: classes, prestige, custom abilities, and companion systems.",
      modId: "zfolmt-Bloodcraft",
    },
    {
      name: "Vampire Command Framework",
      type: "Mod Framework",
      desc: "Foundation other V Rising plugins build on — install it when a mod lists it as a dependency.",
      modId: "deca-VampireCommandFramework",
    },
    {
      name: "Kindred Commands",
      type: "Admin",
      desc: "Chat-command suite for admins: ban, heal, teleport, item grants, and more.",
      modId: "odjit-KindredCommands",
    },
  ],
  RUST: [
    {
      name: "Oxide/uMod Framework",
      type: "Mod Core",
      desc: "The plugin framework for Rust servers — compiles .cs plugins at boot. Auto-installed with your first plugin.",
      modType: "UMOD",
    },
    {
      name: "Kits",
      type: "Essentials",
      desc: "One-click loadouts of items, commands and vehicles for admins and groups.",
      modType: "UMOD",
      modId: "Kits",
    },
    {
      name: "Clans",
      type: "Social",
      desc: "Player-created clans with tags, chat, and ally/friendly-fire management.",
      modType: "UMOD",
      modId: "Clans",
    },
    {
      name: "ImageLibrary",
      type: "Library",
      desc: "Icon preloader required by many popular Rust plugins.",
      modType: "UMOD",
      modId: "ImageLibrary",
    },
  ],
};

/* ─── Helpers ─────────────────────────────────────────────────── */

const LOADER_LABELS: Record<string, string> = {
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
  tmodloader: "tModLoader",
};

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
  const [errorBootOutput, setErrorBootOutput] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [installedMods, setInstalledMods] = useState<any[]>([]);
  const [loaderInfo, setLoaderInfo] = useState<{ supported: boolean; loader: { type: string; loaderVersion: string; minecraftVersion: string } | null } | null>(null);
  const [loaderBusy, setLoaderBusy] = useState(false);
  const { event: installEvent, start: startInstallProgress, dismiss: dismissInstallProgress } = useModInstallProgress(selectedServer?.id);
  const [updatingModId, setUpdatingModId] = useState<string | null>(null);
  const [updateAllBusy, setUpdateAllBusy] = useState(false);
  const [updatePackBusy, setUpdatePackBusy] = useState(false);
  const [packInfo, setPackInfo] = useState<any>(null);
  const [packUpdatable, setPackUpdatable] = useState(false);
  const [syncingDisk, setSyncingDisk] = useState(false);
  const [updatesInfo, setUpdatesInfo] = useState<{ updates: any[]; unknown: any[] } | null>(null);
  const [staleOnly, setStaleOnly] = useState(false);

  /** Surface a mod-flow failure; bootOutput carries the sandbox server's own
   *  output when a snapshot->install->boot-test cycle rolled back. */
  const showError = (message: string | null, bootOutput?: string, warnings?: string[]) => {
    const suffix = warnings?.length ? `\n\n${warnings.join("\n")}` : "";
    setError(message ? message + suffix : message);
    setErrorBootOutput(bootOutput ?? null);
  };

  /* Tabs */
  const [activeTab, setActiveTab] = useState<TabId>("discover");

  /* Search / Browse state */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [popularMods, setPopularMods] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState("relevance");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [browseOffset, setBrowseOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  /* Minecraft pack browsing: CurseForge modpacks instead of mods */
  const [packMode, setPackMode] = useState(false);

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
    game === "TERRARIA" ||
    game === "VRISING" ||
    game === "RUST";

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
      fetch(`/api/servers/${selectedServer.id}/mods/loader`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setLoaderInfo(d))
        .catch(() => {});
      fetch(`/api/servers/${selectedServer.id}/mods`)
        .then((res) => res.json())
        .then((data) => {
          if (data.mods) setInstalledMods(data.mods);
        })
        .catch((err) => console.error(err));
      fetchPack();
    } else {
      setInstalledMods([]);
      setSearchResults([]);
      setPopularMods([]);
      setSearchQuery("");
    }
  }, [selectedServer]);

  /**
   * Reconcile mod rows with disk whenever the Installed tab loads, so drift
   * from hand-deleted files or manual edits is caught from every direction —
   * not just after snapshot/backup restores. Silent unless it found drift;
   * viewers without ADMIN get a quiet 403 that we ignore.
   */
  React.useEffect(() => {
    if (activeTab !== "installed" || !selectedServer) return;
    const serverId = selectedServer.id;
    fetch(`/api/servers/${serverId}/mods/reconcile`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.mods) setInstalledMods(data.mods);
        const { removed, added, repaired } = data.result || {};
        if (removed || added || repaired) {
          toast.info(
            `Synced with disk: ${[
              removed ? `${removed} stale row${removed === 1 ? "" : "s"} removed` : null,
              added ? `${added} mod${added === 1 ? "" : "s"} found on disk added` : null,
              repaired ? `${repaired} row${repaired === 1 ? "" : "s"} repaired` : null,
            ].filter(Boolean).join(", ")}.`
          );
        }
      })
      .catch(() => {});
  }, [activeTab, selectedServer]);

  /** Installed-mod rows with a newer provider version, keyed for card badges */
  const staleByPackage = useMemo(
    () => new Map((updatesInfo?.updates || []).map((u: any) => [u.packageId, u])),
    [updatesInfo]
  );

  /** Fetch the stale/unknown mod report for the selected server */
  const refreshUpdates = React.useCallback(() => {
    const serverId = selectedServer?.id;
    if (!serverId) {
      setUpdatesInfo(null);
      return;
    }
    fetch(`/api/servers/${serverId}/mods/updates`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUpdatesInfo(data))
      .catch(() => {});
  }, [selectedServer]);

  /** Check installed mods against provider latests when the Installed tab loads */
  React.useEffect(() => {
    setStaleOnly(false);
    if (activeTab !== "installed" || !selectedServer) {
      setUpdatesInfo(null);
      return;
    }
    refreshUpdates();
  }, [activeTab, selectedServer, refreshUpdates]);

  /** Fetch popular / trending mods on mount (for Discover tab) */
  React.useEffect(() => {
    if (!selectedServer || !supportsSearch) return;

    setIsSearching(true);
    fetch(`/api/servers/${selectedServer.id}/mods/search?q=&sort=rating`)
      .then((res) => res.json())
      .then((data) => {
        if (data.results) setPopularMods(data.results);
      })
      .catch((err) => console.error("Popular mods fetch failed:", err))
      .finally(() => setIsSearching(false));
  }, [selectedServer]);

  /** Debounced search (Browse tab) */
  React.useEffect(() => {    if (!selectedServer) {
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
        ...(packMode && game === "MINECRAFT" && { type: "modpacks" }),
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
  }, [searchQuery, selectedServer, sortBy, selectedCategory, packMode, game]);

  /* ── Handlers ────────────────────────────────────────────────── */

  // The install API validates modType against a fixed enum; search results
  // carry a provider instead. The server only uses modType to tell the
  // BepInEx core install apart from normal package installs.
  const installModType = (mod: { modType?: string; provider?: string; workshopId?: string }): string => {
    if (mod.modType === "BEPINEX") return "BEPINEX";
    if (mod.modType === "UMOD") return "UMOD";
    if (mod.provider === "modrinth") return "MODRINTH";
    if (mod.provider === "curseforge") return "CURSEFORGE";
    if (mod.provider === "umod") return "UMOD";
    if (mod.provider === "ficsit") return "FICSIT";
    if (mod.provider === "workshop" || mod.workshopId) return "STEAM_WORKSHOP";
    return "THUNDERSTORE";
  };

  const handleInstallPack = async (mod: { modId?: string; packageId?: string; name: string }) => {
    if (!selectedServer) return;
    setLoading(true);
    showError(null);
    setSuccess(null);
    const installId = newInstallId();
    startInstallProgress(installId);

    try {
      const res = await fetch(
        `/api/servers/${selectedServer.id}/mods/install-pack`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: mod.modId || mod.packageId, installId }),
        }
      );
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || "Failed to install modpack"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }

      setSuccess(data.message || `Successfully installed ${mod.name}`);
      if (data.message) toast.success(data.message); else toast.success(`Installed ${mod.name}`);

      const modsRes = await fetch(`/api/servers/${selectedServer.id}/mods`);
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
      fetchPack();
      // Packs provision their own loader — re-read state or the banner lies.
      await refreshLoaderState();
    } catch (err: any) {
      showError(err.message, (err as any).bootOutput, (err as any).warnings);
    } finally {
      setLoading(false);
    }
  };

  /** Search-result install dispatch: pack cards go through install-pack. */
  const handleInstallSearchResult = (mod: any) => {
    if (mod.kind === "modpack") return handleInstallPack(mod);
    return handleInstallMod(mod);
  };

  /** Re-fetch loader state — every flow that can install/switch a loader
   * must call this, or the vanilla-server banner goes stale. */
  const refreshLoaderState = async () => {
    if (!selectedServer) return;
    const lres = await fetch(`/api/servers/${selectedServer.id}/mods/loader`);
    if (lres.ok) setLoaderInfo(await lres.json());
  };

  const handleInstallLoader = async (loader: "fabric" | "quilt" | "forge" | "neoforge" | "tmodloader") => {
    if (!selectedServer) return;
    const label = LOADER_LABELS[loader];
    setLoaderBusy(true);
    const installId = newInstallId();
    startInstallProgress(installId);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/loader`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loader, installId }),
      });
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || `Failed to install ${label}`); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }
      toast.success(data.message || `${label} installed.`);
      await refreshLoaderState();
    } catch (err: any) {
      if ((err as any).bootOutput) showError(err.message, (err as any).bootOutput, (err as any).warnings);
      else toast.error(err.message);
    } finally {
      setLoaderBusy(false);
    }
  };

  const handleUpdateMod = async (mod: any) => {
    if (!selectedServer) return;
    setUpdatingModId(mod.id);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/${mod.packageId}/update`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || "Update failed"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }
      toast[data.updated ? "success" : "info"](data.message);
      if (data.updated) {
        const fresh = await fetch(`/api/servers/${selectedServer.id}/mods`).then((r) => r.json());
        setInstalledMods(fresh.mods || fresh || []);
        refreshUpdates();
      }
    } catch (err: any) {
      if ((err as any).bootOutput) showError(err.message, (err as any).bootOutput, (err as any).warnings);
      else toast.error(err.message);
    } finally {
      setUpdatingModId(null);
    }
  };

  /** Update every stale mod in one snapshot window (sequential, stop-on-failure,
   *  full rollback server-side). */
  const handleUpdateAll = async () => {
    if (!selectedServer || updateAllBusy) return;
    setUpdateAllBusy(true);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/update-all`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || "Update all failed"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }
      toast.success(data.message);
      const fresh = await fetch(`/api/servers/${selectedServer.id}/mods`).then((r) => r.json());
      setInstalledMods(fresh.mods || fresh || []);
      refreshUpdates();
    } catch (err: any) {
      if ((err as any).bootOutput) showError(err.message, (err as any).bootOutput, (err as any).warnings);
      else toast.error(err.message);
    } finally {
      setUpdateAllBusy(false);
    }
  };

  /** uMod only: one user-clicked metadata request per plugin (batch checks
   * would 429 against umod.org — the check-update route is deliberately
   * single-plugin). Offers the Update button when a newer release exists. */
  const handleCheckUpdate = async (mod: any) => {
    if (!selectedServer) return;
    setUpdatingModId(mod.id);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/${mod.id}/check-update`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");
      if (data.upToDate === null) toast.error(`Couldn't reach uMod for ${mod.name} — try again in a minute.`);
      else if (data.upToDate) toast.info(`${mod.name} is up to date (${data.currentVersion}).`);
      else toast.success(`${mod.name} has a newer release: ${data.latestVersion} (installed ${data.currentVersion}). Use Update to install it.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingModId(null);
    }
  };

  /** Re-resolve the installed CurseForge pack's newest file, re-apply it, and
   * drop mods that left the new manifest (server-side, one snapshot window). */
  const handleUpdatePack = async () => {
    if (!selectedServer || updatePackBusy) return;
    setUpdatePackBusy(true);
    const installId = newInstallId();
    startInstallProgress(installId);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/update-pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installId }),
      });
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || "Pack update failed"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }
      toast[data.updated ? "success" : "info"](data.message);
      if (data.updated) {
        const fresh = await fetch(`/api/servers/${selectedServer.id}/mods`).then((r) => r.json());
        setInstalledMods(fresh.mods || fresh || []);
        refreshUpdates();
        fetchPack();
        await refreshLoaderState();
      }
    } catch (err: any) {
      if ((err as any).bootOutput) showError(err.message, (err as any).bootOutput, (err as any).warnings);
      else toast.error(err.message);
    } finally {
      setUpdatePackBusy(false);
    }
  };

  const fetchPack = async () => {
    if (!selectedServer || selectedServer.game.toUpperCase() !== "MINECRAFT") return;
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/pack`);
      const data = await res.json();
      setPackInfo(data.pack && data.pack.packName ? data.pack : null);
      setPackUpdatable(!!data.updatable);
    } catch {
      setPackInfo(null);
    }
  };

  const handleSyncWithDisk = async () => {
    if (!selectedServer || syncingDisk) return;
    setSyncingDisk(true);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/reconcile`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || "Sync failed"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }
      if (data.mods) setInstalledMods(data.mods);
      const { removed, added, repaired } = data.result || {};
      const drifted = removed || added || repaired;
      toast[drifted ? "success" : "info"](
        drifted
          ? `Synced with disk: ${[
              removed ? `${removed} stale row${removed === 1 ? "" : "s"} removed` : null,
              added ? `${added} mod${added === 1 ? "" : "s"} found on disk added` : null,
              repaired ? `${repaired} row${repaired === 1 ? "" : "s"} repaired` : null,
            ].filter(Boolean).join(", ")}.`
          : "Installed mods already match disk."
      );
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncingDisk(false);
    }
  };

  const handleDeleteMod = async (mod: any) => {
    if (!selectedServer) return;
    if (!confirm(`Are you sure you want to uninstall ${mod.name}?`)) return;

    setLoading(true);
    showError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/mods/${mod.packageId || mod.modId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || "Failed to uninstall mod"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }

      setSuccess(`Successfully uninstalled ${mod.name}`);
      
      // Refresh
      const modsRes = await fetch(`/api/servers/${selectedServer.id}/mods`);
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      showError(err.message, (err as any).bootOutput, (err as any).warnings);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallMod = async (mod: {
    modId?: string;
    packageId?: string;
    name: string;
    version?: string;
    downloadUrl?: string;
    modType?: string;
    provider?: string;
    workshopId?: string;
  }) => {
    if (!selectedServer) return;
    setLoading(true);
    showError(null);
    setSuccess(null);

    // The tModLoader runtime is a loader install, not a mod install — it
    // swaps the server's launch (snapshot/boot-test/rollback included) via
    // the loader route.
    if (mod.modType === "TML_LOADER") {
      const installId = newInstallId();
      startInstallProgress(installId);
      try {
        const res = await fetch(`/api/servers/${selectedServer.id}/mods/loader`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loader: "tmodloader", installId }),
        });
        const data = await res.json();
        if (!res.ok) { const e = new Error(data.error || "Failed to install tModLoader"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }
        setSuccess(data.message || "tModLoader installed.");
        setLoaderInfo({ supported: true, loader: data.loader });
        const modsRes = await fetch(`/api/servers/${selectedServer.id}/mods`);
        const modsData = await modsRes.json();
        if (modsData.mods) setInstalledMods(modsData.mods);
      } catch (err: any) {
        showError(err.message, (err as any).bootOutput, (err as any).warnings);
      } finally {
        setLoading(false);
      }
      return;
    }

    const installId = newInstallId();
    startInstallProgress(installId);
    try {
      const res = await fetch(
        `/api/servers/${selectedServer.id}/mods/install`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installId,
            modType: installModType(mod),
            // Workshop results: packageId is the Workshop file id, not a mod
            // id — sending it as modId would write the wrong id space into
            // Mods=. Omitting modId lets the server derive it from the
            // downloaded item's mod.info.
            modId: mod.provider === "workshop" ? mod.modId : (mod.modId || mod.packageId),
            modName: mod.name,
            version: mod.version,
            downloadUrl: mod.downloadUrl,
            workshopId: mod.workshopId || (mod.provider === "workshop" ? mod.packageId : undefined),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || "Failed to install mod"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }

      setSuccess(
        data.message ||
          `Successfully installed '${mod.name}' to server '${selectedServer.name}'!`
      );
      // Refresh installed mods
      const modsRes = await fetch(
        `/api/servers/${selectedServer.id}/mods`
      );
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      showError(err.message, (err as any).bootOutput, (err as any).warnings);
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
      ...(packMode && game === "MINECRAFT" && { type: "modpacks" }),
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
    showError(null);
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
        { const e = new Error(data.error || "Failed to import collection"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }

      setSuccess(data.message || "Collection imported successfully!");
      const modsRes = await fetch(
        `/api/servers/${selectedServer.id}/mods`
      );
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
    } catch (err: any) {
      showError(err.message, (err as any).bootOutput, (err as any).warnings);
    } finally {
      setLoading(false);
    }

    e.target.value = "";
  };

  const handleImportModpack = async (
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
    showError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("modpack", file);
    const installId = newInstallId();
    startInstallProgress(installId);
    formData.append("installId", installId);

    try {
      const res = await fetch(
        `/api/servers/${selectedServer.id}/mods/import-modpack`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok)
        { const e = new Error(data.error || "Failed to import modpack"); (e as any).bootOutput = data.bootOutput; (e as any).warnings = data.warnings; throw e; }

      setSuccess(data.message || "Modpack imported successfully!");
      const modsRes = await fetch(
        `/api/servers/${selectedServer.id}/mods`
      );
      const modsData = await modsRes.json();
      if (modsData.mods) setInstalledMods(modsData.mods);
      fetchPack();
      await refreshLoaderState();
    } catch (err: any) {
      showError(err.message, (err as any).bootOutput, (err as any).warnings);
    } finally {
      setLoading(false);
    }

    e.target.value = "";
  };

  const handleZomboidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customWorkshopId) return;
    handleInstallMod({
      name: customModId
        ? `Workshop ID ${customWorkshopId} (${customModId})`
        : `Workshop ID ${customWorkshopId}`,
      modId: customModId || undefined,
      workshopId: customWorkshopId,
    });
    setCustomWorkshopId("");
    setCustomModId("");
  };

  /** The Configure modal covers every ecosystem that ships editable config
   * files: BepInEx .cfg (Valheim/V Rising), Forge-standard .toml (Minecraft),
   * Oxide .json (Rust). */
  const canConfigure = (mod: { provider: string }) => {
    const g = selectedServer?.game?.toUpperCase();
    if (mod.provider === "thunderstore") return g === "VALHEIM" || g === "VRISING";
    if (mod.provider === "modrinth" || mod.provider === "curseforge") return g === "MINECRAFT";
    if (mod.provider === "umod") return g === "RUST";
    return false;
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
                    showError(null);
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
        {installEvent && (
          <div className="mb-6">
            <InstallProgressPanel event={installEvent} onDismiss={dismissInstallProgress} />
          </div>
        )}
        {error && (
          <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-slide-down">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 flex-shrink-0" />
              <span className="whitespace-pre-wrap">{error}</span>
              <button
                onClick={() => showError(null)}
                className="ml-auto text-red-400/60 hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {errorBootOutput && (
              <details className="mt-3 rounded-lg bg-black/30 border border-red-500/10">
                <summary className="px-3 py-2 text-xs font-bold text-red-300/80 cursor-pointer select-none">
                  Sandbox boot output
                </summary>
                <pre className="px-3 pb-3 text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto custom-scrollbar">
                  {errorBootOutput}
                </pre>
              </details>
            )}
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
                                  onClick={() => handleInstallMod(mod)}
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
                        💡 <strong>Mod loaders:</strong> Fabric, Quilt, Forge,
                        and NeoForge mods need their loader installed first — a
                        vanilla server silently ignores the mods/ folder.
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

                        {/* Minecraft: browse CurseForge modpacks instead of mods */}
                        {game === "MINECRAFT" && (
                          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/5">
                            <span className="text-[10px] text-mutedText font-bold uppercase tracking-wider mr-1">
                              Browse:
                            </span>
                            {[
                              { id: false, label: "Mods" },
                              { id: true, label: "Modpacks" },
                            ].map((opt) => (
                              <button
                                key={opt.label}
                                onClick={() => setPackMode(opt.id)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                                  packMode === opt.id
                                    ? "bg-accentPurple/25 text-accentPurple border border-accentPurple/40"
                                    : "bg-white/5 text-slate-400 border border-transparent hover:bg-white/10"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                            {packMode && (
                              <span className="text-[10px] text-mutedText ml-1">
                                One-click full pack installs — snapshot + boot-tested, rolled back on failure.
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Zomboid / Terraria Workshop Form */}
                      {(game === "ZOMBOID" || game === "TERRARIA") && (
                        <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-3">
                          <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                            <Plus className="w-4 h-4 text-emerald-400" />
                            Custom Workshop Mod
                          </h4>
                          <p className="text-[11px] text-mutedText">
                            {game === "TERRARIA"
                              ? "Don't see your mod above? Paste its Workshop ID — the mod name is detected from the downloaded .tmod (tModLoader must be installed first)."
                              : "Don't see your mod above? Enter a Workshop ID. The Mod ID is detected from the downloaded files when left blank."}
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
                                placeholder={game === "TERRARIA" ? "e.g. 2563309347" : "e.g. 2875848298"}
                                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                                required
                              />
                            </div>
                            {game === "ZOMBOID" && (
                              <div>
                                <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1">
                                  Mod ID (optional)
                                </label>
                                <input
                                  type="text"
                                  value={customModId}
                                  onChange={(e) =>
                                    setCustomModId(e.target.value)
                                  }
                                  placeholder="Auto-detected if left blank"
                                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                                />
                              </div>
                            )}
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
                                onInstall={handleInstallSearchResult}
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
                {updatesInfo && (updatesInfo.updates.length > 0 || staleOnly) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs text-sky-300">
                    <span className="font-bold flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      {staleOnly ? (
                        <>
                          Showing {updatesInfo.updates.length} mod{updatesInfo.updates.length === 1 ? "" : "s"} with available updates
                          {updatesInfo.unknown.length > 0
                            ? ` · ${updatesInfo.unknown.length} with unknown versions (use Update to pin them)`
                            : ""}
                          .
                        </>
                      ) : (
                        <>
                          {updatesInfo.updates.length} mod{updatesInfo.updates.length === 1 ? " has" : "s have"} updates available
                          {updatesInfo.unknown.length > 0
                            ? ` · ${updatesInfo.unknown.length} with unknown versions`
                            : ""}
                          .
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {!staleOnly && updatesInfo.updates.length > 0 && (
                        <button
                          onClick={handleUpdateAll}
                          disabled={updateAllBusy}
                          className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/40 hover:bg-sky-500/30 text-sky-200 font-bold transition-colors disabled:opacity-50"
                          title="Updates every stale mod in one snapshot window: sequential updates, one sandbox boot test, full rollback on any failure."
                        >
                          {updateAllBusy ? "Updating…" : `Update all (${updatesInfo.updates.length})`}
                        </button>
                      )}
                      <button
                        onClick={() => setStaleOnly((v) => !v)}
                        className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/40 hover:bg-sky-500/30 text-sky-200 font-bold transition-colors"
                      >
                        {staleOnly ? "Show all mods" : "Review updates"}
                      </button>
                    </div>
                  </div>
                )}
                {game === "MINECRAFT" && loaderInfo?.supported && (
                  loaderInfo.loader ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300">
                      <span className="font-bold flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {LOADER_LABELS[loaderInfo.loader.type] || loaderInfo.loader.type}{" "}
                        {loaderInfo.loader.loaderVersion} active (Minecraft {loaderInfo.loader.minecraftVersion}) — jars in mods/ load on boot.
                      </span>
                      <button
                        onClick={() => handleInstallLoader(loaderInfo.loader!.type as "fabric" | "quilt" | "forge" | "neoforge" | "tmodloader")}
                        disabled={loaderBusy}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-200 font-bold transition-colors disabled:opacity-50"
                        title="Snapshot-backed reinstall of the newest loader version. To switch loaders, restore a pre-loader snapshot (Backups) first."
                      >
                        {loaderBusy ? "Updating…" : "Update Loader"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
                      <span className="font-bold">
                        This is a vanilla server — mods won't load until you install a mod loader.
                      </span>
                      <div className="flex items-center gap-2">
                        {(["fabric", "quilt", "forge", "neoforge"] as const).map((l) => (
                          <button
                            key={l}
                            onClick={() => handleInstallLoader(l)}
                            disabled={loaderBusy}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-200 font-bold transition-colors disabled:opacity-50"
                          >
                            Install {LOADER_LABELS[l]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                )}
                {game === "TERRARIA" && loaderInfo?.supported && (
                  loaderInfo.loader ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300">
                      <span className="font-bold flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        tModLoader active — the server boots through it and loads Workshop mods on startup.
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
                      <span className="font-bold">
                        This is a vanilla server — Terraria mods need the tModLoader runtime to load.
                      </span>
                      <button
                        onClick={() => handleInstallLoader("tmodloader")}
                        disabled={loaderBusy}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-200 font-bold transition-colors disabled:opacity-50"
                      >
                        {loaderBusy ? "Installing…" : "Install tModLoader"}
                      </button>
                    </div>
                  )
                )}
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
                    <button
                      onClick={handleSyncWithDisk}
                      disabled={syncingDisk}
                      title="Re-check installed mods against the server's files on disk"
                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 text-xs font-bold text-slate-300 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingDisk ? "animate-spin" : ""}`} />
                      <span>Sync with disk</span>
                    </button>

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

                    <label className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 text-xs font-bold text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-accentPurple" />
                      <span>Import Modpack (.mrpack)</span>
                      <input
                        type="file"
                        accept=".mrpack,.zip"
                        className="hidden"
                        onChange={handleImportModpack}
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

                {game === "MINECRAFT" && packInfo && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/25 text-xs text-violet-300">
                    <span className="font-bold flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Pack: {packInfo.packName} {packInfo.version}
                      {packInfo.fileId != null && ` · CF file ${packInfo.fileId}`}
                      {packInfo.loaderType && ` · ${packInfo.loaderType}`}
                      {!packUpdatable && " · imported manually (no project identity — re-import to update)"}
                    </span>
                    {packUpdatable && (
                      <button
                        onClick={handleUpdatePack}
                        disabled={updatePackBusy}
                        className="px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/40 hover:bg-violet-500/30 text-violet-200 font-bold transition-colors disabled:opacity-50"
                        title="Resolves the pack's newest CurseForge file, re-applies it in one snapshot window, and removes mods that left the new manifest."
                      >
                        {updatePackBusy ? "Updating…" : "Update pack"}
                      </button>
                    )}
                  </div>
                )}
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
                    {(staleOnly
                      ? installedMods.filter((mod: any) => staleByPackage.has(mod.packageId))
                      : installedMods
                    ).map((mod: any, idx: number) => (
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
                                {staleByPackage.has(mod.packageId) && (
                                  <span className="text-amber-400" title="Newer version available">
                                    {" → "}{staleByPackage.get(mod.packageId).latest}
                                  </span>
                                )}
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
                            {mod.provider === "modrinth" || mod.provider === "thunderstore" || mod.provider === "curseforge" || mod.provider === "umod" || (mod.provider === "workshop" && game === "TERRARIA") ? (
                              <button
                                onClick={() => handleUpdateMod(mod)}
                                disabled={loading || updatingModId === mod.id}
                                className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-xs font-bold text-sky-400 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                title="Check for and install a newer version"
                              >
                                <RefreshCw className={`w-3 h-3 ${updatingModId === mod.id ? "animate-spin" : ""}`} />
                                {updatingModId === mod.id ? "Updating…" : "Update"}
                              </button>
                            ) : null}
                            {mod.provider === "umod" && (
                              <button
                                onClick={() => handleCheckUpdate(mod)}
                                disabled={updatingModId === mod.id}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                title="One manual metadata request per plugin — umod.org rate-limits batched checks"
                              >
                                <Search className={`w-3 h-3 ${updatingModId === mod.id ? "animate-spin" : ""}`} />
                                Check for updates
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteMod(mod)}
                              disabled={loading}
                              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs font-bold text-red-500 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Trash className="w-3 h-3" />
                              Uninstall
                            </button>
                            {canConfigure(mod) && (
                              <button
                                onClick={() => handleConfigureClick(mod)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                              >
                                <Settings className="w-3 h-3" />
                                Configure
                              </button>
                            )}
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
                    if (detailMod.kind === "modpack") {
                      handleInstallPack({
                        name: detailMod.name,
                        modId: detailMod.packageId,
                      });
                    } else {
                      handleInstallMod({
                        name: detailMod.name,
                        modId: detailMod.packageId,
                        version: detailMod.version,
                        downloadUrl: detailMod.downloadUrl,
                        provider: detailMod.provider,
                      });
                    }
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
                              {prop.type === "JSON" ? (
                                <textarea
                                  value={prop.value}
                                  onChange={(e) =>
                                    updateConfigValue(
                                      sIdx,
                                      pIdx,
                                      e.target.value
                                    )
                                  }
                                  rows={Math.min(12, Math.max(3, prop.value.split("\n").length))}
                                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-900 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                                />
                              ) : prop.type === "Boolean" ? (
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
                version: mod.version,
                downloadUrl: mod.downloadUrl,
                provider: mod.provider,
                kind: mod.kind,
              });
            }}
            disabled={loading}
            title={
              serverStatus === "RUNNING" || serverStatus === "STARTING"
                ? "The server is running — installing will ask you to stop it first."
                : undefined
            }
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
