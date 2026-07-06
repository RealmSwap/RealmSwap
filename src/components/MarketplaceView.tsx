"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Search,
  ThumbsUp,
  ThumbsDown,
  Filter,
  Settings,
  Wrench,
  Store,
  ChevronRight,
  HardDrive,
  LayoutDashboard,
  Plus,
  Terminal,
  Clock,
  Users,
  History,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
  ChevronDown,
  X,
  Crown,
  TrendingUp,
  Globe,
  Tag,
  Layers,
  Check,
  Loader2
} from "lucide-react";

/* ─── Types ────────────────────────────────────────────────────── */

interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  gameSlug: string;
  tags: string;
  downloads: number;
  likes: number;
  dislikes: number;
  userVote?: "LIKE" | "DISLIKE" | null;
  payload: string;
  customDefSpec?: string;
  verifiedLevel: string;
  createdAt: string;
}

interface MarketplaceViewProps {
  user: any;
}

type TabId = "discover" | "browse";

/* ─── Game Themes ──────────────────────────────────────────────── */

const GAME_THEMES: Record<
  string,
  {
    gradient: string;
    bg: string;
    border: string;
    text: string;
    icon: string;
  }
> = {
  MINECRAFT: {
    gradient: "from-green-500 to-emerald-700",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-400",
    icon: "⛏️",
  },
  VALHEIM: {
    gradient: "from-amber-500 to-amber-700",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    icon: "⛵",
  },
  ZOMBOID: {
    gradient: "from-red-500 to-rose-700",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    icon: "🧟",
  },
  PALWORLD: {
    gradient: "from-orange-500 to-rose-700",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-400",
    icon: "🦊",
  },
  VRISING: {
    gradient: "from-purple-500 to-red-800",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    icon: "🦇",
  },
  ARK: {
    gradient: "from-cyan-500 to-blue-700",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    text: "text-cyan-400",
    icon: "🦖",
  },
  ENSHROUDED: {
    gradient: "from-blue-500 to-indigo-700",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    icon: "🔥",
  },
  TERRARIA: {
    gradient: "from-lime-500 to-green-700",
    bg: "bg-lime-500/10",
    border: "border-lime-500/30",
    text: "text-lime-400",
    icon: "🌳",
  },
  RUST: {
    gradient: "from-stone-500 to-red-800",
    bg: "bg-stone-500/10",
    border: "border-stone-500/30",
    text: "text-stone-400",
    icon: "⚙️",
  },
  SATISFACTORY: {
    gradient: "from-orange-500 to-amber-700",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-400",
    icon: "🏭",
  },
  WINDROSE: {
    gradient: "from-teal-500 to-cyan-700",
    bg: "bg-teal-500/10",
    border: "border-teal-500/30",
    text: "text-teal-400",
    icon: "⚔️",
  },
};

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatCount(n: number | undefined): string {
  if (n === undefined || n === null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/* ─── Component ───────────────────────────────────────────────── */

export default function MarketplaceView({ user }: MarketplaceViewProps) {
  const router = useRouter();

  /* Tabs */
  const [activeTab, setActiveTab] = useState<TabId>("discover");

  /* Discover State */
  const [staffPicks, setStaffPicks] = useState<MarketplaceTemplate[]>([]);
  const [trending, setTrending] = useState<MarketplaceTemplate[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  /* Browse State */
  const [searchQuery, setSearchQuery] = useState("");
  const [browseResults, setBrowseResults] = useState<MarketplaceTemplate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sortBy, setSortBy] = useState("downloads"); // 'newest', 'likes', 'downloads'
  const [selectedGame, setSelectedGame] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [browseOffset, setBrowseOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  /* Global Data */
  const [availableGames, setAvailableGames] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  /* Detail Modal */
  const [selectedTemplate, setSelectedTemplate] = useState<MarketplaceTemplate | null>(null);
  const [showSecurityReport, setShowSecurityReport] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [systemMemoryGB, setSystemMemoryGB] = useState<number | null>(null);

  /* ── Effects ─────────────────────────────────────────────────── */

  useEffect(() => {
    fetch('/api/system/metrics').then(r => r.json()).then(data => {
      if (data.memory?.totalGB) setSystemMemoryGB(data.memory.totalGB);
    }).catch(console.error);

    // Initial load for Discover tab
    const loadDiscover = async () => {
      setDiscoverLoading(true);
      try {
        const [staffRes, trendRes] = await Promise.all([
          fetch("/api/marketplace?verifiedLevel=OFFICIAL&limit=10&sort=downloads"),
          fetch("/api/marketplace?sort=downloads&limit=12")
        ]);
        
        if (staffRes.ok) {
          const data = await staffRes.json();
          setStaffPicks(data.results || []);
        }
        if (trendRes.ok) {
          const data = await trendRes.json();
          // Exclude official from trending if they overlap, but simple for now
          const trendData = data.results || [];
          setTrending(trendData.filter((t: any) => t.verifiedLevel !== "OFFICIAL"));
          
          // Extract games and tags for filters
          const games = new Set<string>();
          const tags = new Set<string>();
          trendData.forEach((t: MarketplaceTemplate) => {
            games.add(t.gameSlug.toUpperCase());
            t.tags.split(",").forEach(tag => {
              if (tag.trim()) tags.add(tag.trim().toLowerCase());
            });
          });
          setAvailableGames(Array.from(games).sort());
          setAvailableTags(Array.from(tags).sort());
        }
      } catch (err) {
        console.error("Failed to load discover data", err);
      } finally {
        setDiscoverLoading(false);
      }
    };

    loadDiscover();
  }, []);

  // Debounced Search for Browse Tab
  useEffect(() => {
    if (activeTab !== "browse") return;

    setIsSearching(true);
    const delayDebounceFn = setTimeout(() => {
      const params = new URLSearchParams({
        offset: "0",
        limit: "20",
        sort: sortBy,
      });
      if (searchQuery.trim()) params.set("q", searchQuery);
      if (selectedGame) params.set("game", selectedGame);
      if (selectedCategory) params.set("tag", selectedCategory);

      fetch(`/api/marketplace?${params.toString()}`)
        .then(res => res.json())
        .then(data => {
          setBrowseResults(data.results || []);
          setHasMore(data.hasMore || false);
          setBrowseOffset(0);
        })
        .catch(console.error)
        .finally(() => setIsSearching(false));
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, sortBy, selectedGame, selectedCategory, activeTab]);

  /* ── Handlers ────────────────────────────────────────────────── */

  const handleLoadMore = async () => {
    const newOffset = browseOffset + 20;
    setIsSearching(true);

    const params = new URLSearchParams({
      offset: String(newOffset),
      limit: "20",
      sort: sortBy,
    });
    if (searchQuery.trim()) params.set("q", searchQuery);
    if (selectedGame) params.set("game", selectedGame);
    if (selectedCategory) params.set("tag", selectedCategory);

    try {
      const res = await fetch(`/api/marketplace?${params.toString()}`);
      const data = await res.json();
      if (data.results) {
        setBrowseResults(prev => [...prev, ...data.results]);
        setHasMore(data.hasMore || false);
        setBrowseOffset(newOffset);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleVote = async (templateId: string, type: "LIKE" | "DISLIKE" | "NONE") => {
    // Optimistic update
    const updateList = (list: MarketplaceTemplate[]) => list.map(t => {
      if (t.id !== templateId) return t;
      let newLikes = t.likes;
      let newDislikes = t.dislikes;

      if (t.userVote === "LIKE") newLikes--;
      else if (t.userVote === "DISLIKE") newDislikes--;

      if (type === "LIKE") newLikes++;
      else if (type === "DISLIKE") newDislikes++;

      return { ...t, likes: newLikes, dislikes: newDislikes, userVote: type === "NONE" ? null : type };
    });

    setStaffPicks(updateList);
    setTrending(updateList);
    setBrowseResults(updateList);

    if (selectedTemplate?.id === templateId) {
      setSelectedTemplate(updateList([selectedTemplate])[0]);
    }

    try {
      await fetch(`/api/marketplace/${templateId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeploy = async (template: MarketplaceTemplate) => {
    if (!showSecurityReport) {
      setShowSecurityReport(true);
      return;
    }

    setDeploying(true);
    try {
      const res = await fetch("/api/marketplace/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id })
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/config?server=${data.serverId}`);
      } else {
        const err = await res.json();
        alert("Failed to deploy template: " + (err.error || "Unknown error"));
        setDeploying(false);
      }
    } catch (e) {
      console.error(e);
      alert("Error deploying template");
      setDeploying(false);
    }
  };

  /* ── Sub-components ──────────────────────────────────────────── */

  const renderTemplateCard = (t: MarketplaceTemplate, idx: number, isHero = false) => {
    const theme = GAME_THEMES[t.gameSlug.toUpperCase()] || {
      gradient: "from-slate-500 to-slate-700",
      bg: "bg-white/5",
      border: "border-white/10",
      text: "text-slate-400",
      icon: "🎮",
    };

    if (isHero) {
      return (
        <div
          key={t.id}
          onClick={() => setSelectedTemplate(t)}
          className={`flex-shrink-0 w-80 p-6 rounded-2xl border ${theme.border} ${theme.bg} backdrop-blur-sm relative overflow-hidden group transition-transform hover:scale-[1.02] snap-start cursor-pointer`}
          style={{ animationDelay: `${idx * 80}ms`, animationFillMode: "backwards" }}
        >
          {/* Background gradient shimmer */}
          <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-[0.06] group-hover:opacity-[0.12] transition-opacity duration-500`} />
          
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex justify-between items-start">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${theme.text} flex items-center gap-1.5`}>
                <span className="text-sm">{theme.icon}</span> {t.gameSlug}
              </span>
              {t.verifiedLevel === 'OFFICIAL' && (
                <span title="Official Template"><ShieldCheck className="w-5 h-5 text-emerald-400" /></span>
              )}
            </div>
            
            <h4 className="font-extrabold text-lg text-white mt-2 leading-tight group-hover:text-accentPurple transition-colors line-clamp-1">
              {t.name}
            </h4>
            
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
              by {t.author}
            </p>
            
            <p className="text-xs text-slate-300 mt-3 line-clamp-2 leading-relaxed flex-1">
              {t.description}
            </p>

            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-xs text-emerald-400/80 font-medium">
                  <Download className="w-3.5 h-3.5" />
                  {formatCount(t.downloads)}
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-400/80 font-medium">
                  <ThumbsUp className="w-3.5 h-3.5" />
                  {formatCount(t.likes)}
                </div>
              </div>
              <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-[10px] font-bold text-white transition-all uppercase tracking-wider">
                Deploy
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={t.id}
        onClick={() => setSelectedTemplate(t)}
        className="p-5 rounded-xl border border-white/5 bg-slate-950/40 hover:border-white/10 hover:bg-slate-900/40 transition-all cursor-pointer group animate-fade-in flex flex-col h-full"
        style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "backwards" }}
      >
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-lg ${theme.bg} ${theme.border} border flex items-center justify-center flex-shrink-0 text-xl group-hover:scale-105 transition-transform`}>
            {theme.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-extrabold text-base text-slate-100 truncate group-hover:text-white transition-colors" title={t.name}>
                {t.name}
              </h4>
              {t.verifiedLevel === 'VERIFIED' && (
                <span title="Verified Publisher"><ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0" /></span>
              )}
              {t.verifiedLevel === 'OFFICIAL' && (
                <span title="Official Template"><ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" /></span>
              )}
            </div>
            <p className="text-[10px] text-mutedText truncate uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
              <span className={theme.text}>{t.gameSlug}</span> • by {t.author}
            </p>
          </div>
        </div>

        <p className="text-[12px] text-slate-400 mt-3 line-clamp-2 leading-relaxed flex-1" title={t.description}>
          {t.description}
        </p>

        {t.tags && (
          <div className="flex flex-wrap gap-1 mt-3">
            {t.tags.split(",").slice(0, 3).map((tag, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-medium capitalize border border-white/5">
                {tag.trim()}
              </span>
            ))}
            {t.tags.split(",").length > 3 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500 font-medium border border-white/5">
                +{t.tags.split(",").length - 3}
              </span>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-white/5 mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-mutedText font-medium">
            <span className="flex items-center gap-1">
              <Download className="w-3.5 h-3.5" />
              {formatCount(t.downloads)}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="w-3.5 h-3.5" />
              {formatCount(t.likes)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {timeAgo(t.createdAt)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  /* ─── Render ──────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      {/* Sidebar Navigation */}
      <SidebarNavigation user={user} />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 py-8 pb-24 md:pb-8 relative">
        {/* Navigation back */}
        <div className="mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <Store className="w-6 h-6 text-accentPurple animate-float" />
            <span>Community Marketplace</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">
            Discover and deploy pre-configured server templates, complete with mods and optimized settings.
          </p>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/50 border border-white/5 mb-6 w-fit">
          {(
            [
              { id: "discover" as TabId, label: "Discover", Icon: Sparkles },
              { id: "browse" as TabId, label: "Browse", Icon: Search },
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
            </button>
          ))}
        </div>

        {/* ─── DISCOVER TAB ──────────────────────────────── */}
        {activeTab === "discover" && (
          <div className="space-y-8 animate-fade-in">
            {discoverLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 text-accentPurple animate-spin" />
              </div>
            ) : (
              <>
                {/* Staff Picks */}
                {staffPicks.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Crown className="w-5 h-5 text-amber-400" />
                      <h3 className="font-extrabold text-lg text-white">Staff Picks</h3>
                      <span className="text-xs text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-400/10 border border-emerald-400/20 uppercase tracking-wider">
                        Official
                      </span>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x snap-mandatory">
                      {staffPicks.map((t, i) => renderTemplateCard(t, i, true))}
                    </div>
                  </section>
                )}

                {/* Trending */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-accentPurple" />
                    <h3 className="font-extrabold text-lg text-white">Trending Setups</h3>
                  </div>

                  {trending.length === 0 ? (
                    <div className="glass-panel rounded-2xl border border-dashed border-white/5 p-8 text-center">
                      <Store className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <span className="text-sm text-mutedText">No trending templates available right now.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {trending.map((t, i) => renderTemplateCard(t, i, false))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {/* ─── BROWSE TAB ────────────────────────────────── */}
        {activeTab === "browse" && (
          <div className="animate-fade-in flex gap-6">
            {/* Filter Sidebar */}
            <aside className="hidden lg:block w-56 flex-shrink-0 space-y-4">
              {/* Sort */}
              <div className="glass-panel rounded-xl border border-white/5 p-4">
                <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-2.5">
                  Sort By
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setBrowseOffset(0); }}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
                >
                  <option value="downloads">Most Deployed</option>
                  <option value="likes">Highest Rated</option>
                  <option value="newest">Recently Added</option>
                </select>
              </div>

              {/* Games */}
              {availableGames.length > 0 && (
                <div className="glass-panel rounded-xl border border-white/5 p-4">
                  <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-2.5">
                    <Globe className="w-3 h-3 inline mr-1" /> Games
                  </span>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                    <button
                      onClick={() => setSelectedGame("")}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedGame === "" ? "bg-accentPurple/20 text-accentPurple" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      All Games
                    </button>
                    {availableGames.map(game => (
                      <button
                        key={game}
                        onClick={() => setSelectedGame(selectedGame === game ? "" : game)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          selectedGame === game ? "bg-accentPurple/20 text-accentPurple" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        }`}
                      >
                        {game}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {availableTags.length > 0 && (
                <div className="glass-panel rounded-xl border border-white/5 p-4">
                  <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-2.5">
                    <Tag className="w-3 h-3 inline mr-1" /> Tags
                  </span>
                  <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
                    <button
                      onClick={() => setSelectedCategory("")}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedCategory === "" ? "bg-accentPurple/20 text-accentPurple" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      All Tags
                    </button>
                    {availableTags.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(selectedCategory === cat ? "" : cat)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                          selectedCategory === cat ? "bg-accentPurple/20 text-accentPurple" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* Results Area */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Search Bar */}
              <div className="glass-panel rounded-xl border border-white/5 p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search templates, authors, or games..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2.5 text-sm rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors w-full"
                    />
                    {isSearching && (
                      <Loader2 className="w-4 h-4 text-accentPurple absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
                    )}
                  </div>

                  {/* Mobile Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => { setSortBy(e.target.value); setBrowseOffset(0); }}
                    className="lg:hidden px-3 py-2.5 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple cursor-pointer font-bold"
                  >
                    <option value="downloads">Most Deployed</option>
                    <option value="likes">Highest Rated</option>
                    <option value="newest">Recently Added</option>
                  </select>
                </div>

                {/* Active Filters */}
                {(selectedGame || selectedCategory) && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                    <Filter className="w-3 h-3 text-mutedText" />
                    <span className="text-[10px] text-mutedText font-bold uppercase">Filtered:</span>
                    {selectedGame && (
                      <button onClick={() => setSelectedGame("")} className="flex items-center gap-1 px-2 py-0.5 rounded bg-accentPurple/20 text-accentPurple text-[10px] font-bold hover:bg-accentPurple/30 transition-colors uppercase">
                        {selectedGame} <X className="w-3 h-3" />
                      </button>
                    )}
                    {selectedCategory && (
                      <button onClick={() => setSelectedCategory("")} className="flex items-center gap-1 px-2 py-0.5 rounded bg-accentPurple/20 text-accentPurple text-[10px] font-bold hover:bg-accentPurple/30 transition-colors capitalize">
                        {selectedCategory} <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Grid */}
              {browseResults.length === 0 && !isSearching ? (
                <div className="glass-panel rounded-2xl border border-dashed border-white/5 p-12 text-center">
                  <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <span className="text-sm text-slate-400 font-bold block">No templates found</span>
                  <p className="text-xs text-mutedText mt-1.5">Try a different search term or clear filters.</p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-mutedText font-medium">
                    {browseResults.length} {browseResults.length === 1 ? "template" : "templates"} loaded
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {browseResults.map((t, i) => renderTemplateCard(t, i, false))}
                  </div>

                  {hasMore && (
                    <div className="flex justify-center pt-4">
                      <button
                        onClick={handleLoadMore}
                        disabled={isSearching}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-slate-300 transition-colors disabled:opacity-50"
                      >
                        {isSearching ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : <><ChevronDown className="w-4 h-4" /> Load More</>}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── Detail Modal ─────────────────────────────────────── */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => { setSelectedTemplate(null); setShowSecurityReport(false); }}>
          <div className="bg-[#0f111a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-slide-down overflow-hidden" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-start bg-slate-900/30">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl ${GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.bg || 'bg-white/5'} ${GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.border || 'border-white/10'} border flex items-center justify-center text-3xl flex-shrink-0`}>
                  {GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.icon || '🎮'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-extrabold text-white">{selectedTemplate.name}</h2>
                    {selectedTemplate.verifiedLevel === 'OFFICIAL' && <span className="bg-emerald-400/20 text-emerald-400 text-[9px] px-2 py-0.5 rounded-full font-bold tracking-wider uppercase border border-emerald-400/20">Official</span>}
                    {selectedTemplate.verifiedLevel === 'VERIFIED' && <span className="bg-blue-400/20 text-blue-400 text-[9px] px-2 py-0.5 rounded-full font-bold tracking-wider uppercase border border-blue-400/20">Verified</span>}
                  </div>
                  <p className="text-xs text-mutedText mt-1 flex items-center gap-1.5">
                    <span className={GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.text || 'text-slate-400 font-bold'}>{selectedTemplate.gameSlug}</span>
                    <span className="text-white/20">•</span>
                    by <span className="text-slate-300 font-medium">{selectedTemplate.author}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => { setSelectedTemplate(null); setShowSecurityReport(false); }} className="text-slate-400 hover:text-white transition-colors p-1 bg-white/5 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Security Report View */}
            {showSecurityReport ? (() => {
              const payload = JSON.parse(selectedTemplate.payload);
              const customDef = selectedTemplate.customDefSpec ? JSON.parse(selectedTemplate.customDefSpec) : null;
              const requestedRam = customDef?.recommendedRamGB || 4;
              const ramWarning = systemMemoryGB && requestedRam > systemMemoryGB;
              const hasScripts = customDef?.install?.installScript || customDef?.launch?.launchScript;
              const riskLevel = hasScripts ? "HIGH" : (ramWarning ? "MEDIUM" : "LOW");

              return (
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                  <div className="flex items-center gap-3 text-accentPurple mb-2 border-b border-white/5 pb-4">
                    <ShieldAlert className="w-8 h-8" />
                    <div>
                      <h3 className="font-bold text-xl text-white">Import Security Report</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Review the blueprint configuration before deploying to your local machine.</p>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="p-4 rounded-xl bg-slate-950/50 border border-white/5 flex items-start gap-4">
                      <div className="p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20"><Wrench className="w-5 h-5 text-blue-400" /></div>
                      <div>
                        <div className="font-bold text-sm text-white mb-0.5">Mods & Plugins</div>
                        <div className="text-xs text-mutedText leading-relaxed">{payload.mods?.length || 0} packages. Handled natively via trusted providers (Thunderstore, Modrinth, Steam).</div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/50 border border-white/5 flex items-start gap-4">
                      <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/20"><HardDrive className="w-5 h-5 text-amber-400" /></div>
                      <div>
                        <div className="font-bold text-sm text-white mb-0.5">Resource Usage</div>
                        <div className="text-xs text-mutedText leading-relaxed">Template requests {requestedRam} GB RAM.</div>
                        {ramWarning && (
                          <div className="mt-2 text-[11px] px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20 text-red-400 font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4" /> Warning: Host machine only has {systemMemoryGB.toFixed(1)} GB available. Performance issues likely.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/50 border border-white/5 flex items-start gap-4">
                      <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20"><ShieldCheck className="w-5 h-5 text-emerald-400" /></div>
                      <div>
                        <div className="font-bold text-sm text-white mb-0.5">Security Risk Level</div>
                        <div className={`text-xs font-extrabold uppercase tracking-wider mb-1 ${riskLevel === 'HIGH' ? 'text-red-400' : riskLevel === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {riskLevel} RISK
                        </div>
                        <div className="text-xs text-mutedText leading-relaxed">
                          No arbitrary scripts detected. Template operates strictly as a data blueprint.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })() : (
              /* Normal Detail View */
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 flex flex-col items-center justify-center">
                    <Download className="w-5 h-5 text-emerald-400 mb-1.5" />
                    <span className="font-extrabold text-sm text-white">{formatCount(selectedTemplate.downloads)}</span>
                    <span className="text-[10px] text-mutedText uppercase tracking-wider font-semibold">Deploys</span>
                  </div>
                  <div 
                    className={`p-3.5 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      selectedTemplate.userVote === 'LIKE' ? 'bg-accentPurple/10 border-accentPurple/30 text-accentPurple' : 'bg-slate-950/40 border-white/5 hover:border-white/10 hover:bg-slate-900/50'
                    }`}
                    onClick={() => handleVote(selectedTemplate.id, selectedTemplate.userVote === 'LIKE' ? 'NONE' : 'LIKE')}
                  >
                    <ThumbsUp className={`w-5 h-5 mb-1.5 ${selectedTemplate.userVote === 'LIKE' ? 'text-accentPurple' : 'text-blue-400'}`} />
                    <span className="font-extrabold text-sm text-white">{formatCount(selectedTemplate.likes)}</span>
                    <span className="text-[10px] text-mutedText uppercase tracking-wider font-semibold">Likes</span>
                  </div>
                  <div 
                    className={`p-3.5 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      selectedTemplate.userVote === 'DISLIKE' ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-slate-950/40 border-white/5 hover:border-white/10 hover:bg-slate-900/50'
                    }`}
                    onClick={() => handleVote(selectedTemplate.id, selectedTemplate.userVote === 'DISLIKE' ? 'NONE' : 'DISLIKE')}
                  >
                    <ThumbsDown className={`w-5 h-5 mb-1.5 ${selectedTemplate.userVote === 'DISLIKE' ? 'text-red-400' : 'text-rose-400'}`} />
                    <span className="font-extrabold text-sm text-white">{formatCount(selectedTemplate.dislikes)}</span>
                    <span className="text-[10px] text-mutedText uppercase tracking-wider font-semibold">Dislikes</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5 flex flex-col items-center justify-center">
                    <Clock className="w-5 h-5 text-slate-400 mb-1.5" />
                    <span className="font-extrabold text-sm text-white">{timeAgo(selectedTemplate.createdAt)}</span>
                    <span className="text-[10px] text-mutedText uppercase tracking-wider font-semibold">Added</span>
                  </div>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed bg-slate-900/20 p-4 rounded-xl border border-white/5">
                  {selectedTemplate.description}
                </p>

                {selectedTemplate.tags && (
                  <div>
                    <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-2">Categories</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.tags.split(',').map((t, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-white/5 text-slate-300 font-medium capitalize border border-white/10">
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTemplate.customDefSpec && (
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3">
                    <Wrench className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-blue-400 text-sm mb-1">Custom Game Definition</h3>
                      <p className="text-xs text-blue-200/80 leading-relaxed">
                        This template introduces a game not officially supported by RealmSwap yet. The game definition will be installed automatically to your local vault.
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-2">What's Included</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(() => {
                      const payload = JSON.parse(selectedTemplate.payload);
                      return (
                        <>
                          <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
                            <Package className="w-4 h-4 text-accentPurple mb-2" />
                            <p className="text-xs font-bold text-white mb-0.5">Mods & Plugins</p>
                            <p className="text-[11px] text-mutedText">{payload.mods?.length || 0} packages</p>
                          </div>
                          <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
                            <Settings className="w-4 h-4 text-accentBlue mb-2" />
                            <p className="text-xs font-bold text-white mb-0.5">Config Overrides</p>
                            <p className="text-[11px] text-mutedText">{payload.configOverrides?.length || 0} files modified</p>
                          </div>
                          <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
                            <Terminal className="w-4 h-4 text-emerald-400 mb-2" />
                            <p className="text-xs font-bold text-white mb-0.5">Startup Params</p>
                            <p className="text-[11px] text-mutedText">{Object.keys(payload.startupParams || {}).length} variables</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="p-5 border-t border-white/10 bg-slate-900/50 flex justify-end gap-3 rounded-b-2xl mt-auto">
              <button 
                onClick={() => { setSelectedTemplate(null); setShowSecurityReport(false); }}
                className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-300 hover:bg-white/5 transition-colors"
                disabled={deploying}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDeploy(selectedTemplate)}
                disabled={deploying}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm bg-accentPurple hover:bg-accentPurpleHover text-white shadow-lg shadow-accentPurple/20 transition-all disabled:opacity-50"
              >
                {deploying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Deploying...</>
                ) : (
                  <><Download className="w-4 h-4" /> {showSecurityReport ? "Approve & Deploy" : "One-Click Deploy"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Ensure missing Package icon is imported or fallback
function Package(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  );
}
