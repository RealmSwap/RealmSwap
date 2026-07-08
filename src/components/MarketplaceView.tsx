"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import {
  Download,
  Search,
  ThumbsUp,
  ThumbsDown,
  Filter,
  Settings,
  Wrench,
  Store,
  BarChart3,
  ChevronRight,
  HardDrive,
  LayoutDashboard,
  Plus,
  Terminal,
  Clock,
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
  Loader2,
  Package
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
  const { addToast } = useToast();
  
  const [activeTab, setActiveTab] = useState<"discover" | "browse">("discover");

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
        addToast("error", "Failed to deploy template: " + (err.error || "Unknown error"));
        setDeploying(false);
      }
    } catch (e) {
      console.error(e);
      addToast("error", "Error deploying template");
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
        className="relative p-6 rounded-2xl border border-white/5 bg-slate-950/40 hover:border-white/10 transition-all duration-500 cursor-pointer group animate-fade-in flex flex-col h-full overflow-hidden"
        style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "backwards" }}
      >
        {/* Hover Gradient Aura */}
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
        
        <div className="relative z-10 flex items-start gap-4">
          <div className={`w-14 h-14 rounded-xl ${theme.bg} ${theme.border} border flex items-center justify-center flex-shrink-0 text-2xl shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
            {theme.icon}
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-extrabold text-base text-slate-100 truncate group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-300 transition-all duration-300" title={t.name}>
                {t.name}
              </h4>
              <div className="flex gap-1 flex-shrink-0">
                {t.verifiedLevel === 'VERIFIED' && (
                  <span title="Verified Publisher"><ShieldCheck className="w-4 h-4 text-blue-400" /></span>
                )}
                {t.verifiedLevel === 'OFFICIAL' && (
                  <span title="Official Template"><ShieldCheck className="w-4 h-4 text-emerald-400" /></span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-mutedText truncate uppercase tracking-widest font-bold flex items-center gap-1.5 mt-1">
              <span className={theme.text}>{t.gameSlug}</span>
              <span className="text-white/20">•</span>
              <span className="text-slate-500">by</span> <span className="text-slate-400">{t.author}</span>
            </p>
          </div>
        </div>

        <p className="relative z-10 text-[13px] text-slate-400 mt-4 line-clamp-2 leading-relaxed flex-1 group-hover:text-slate-300 transition-colors" title={t.description}>
          {t.description}
        </p>

        {t.tags && (
          <div className="relative z-10 flex flex-wrap gap-1.5 mt-4">
            {t.tags.split(",").slice(0, 3).map((tag, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-bold capitalize border border-white/5 group-hover:border-white/10 transition-colors">
                {tag.trim()}
              </span>
            ))}
            {t.tags.split(",").length > 3 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-transparent text-slate-500 font-bold border border-transparent">
                +{t.tags.split(",").length - 3}
              </span>
            )}
          </div>
        )}

        <div className="relative z-10 pt-4 border-t border-white/5 mt-5 flex items-center justify-between group-hover:border-white/10 transition-colors">
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1.5 group-hover:text-emerald-400/80 transition-colors">
              <Download className="w-3.5 h-3.5" />
              {formatCount(t.downloads)}
            </span>
            <span className="flex items-center gap-1.5 group-hover:text-blue-400/80 transition-colors">
              <ThumbsUp className="w-3.5 h-3.5" />
              {formatCount(t.likes)}
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider group-hover:text-slate-400 transition-colors">
            {timeAgo(t.createdAt)}
          </span>
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
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
              <Store className="w-6 h-6 text-accentPurple animate-float" />
              <span>Community Marketplace</span>
            </h1>
            <p className="text-sm text-mutedText mt-1">
              Discover and deploy pre-configured server templates, complete with mods and optimized settings.
            </p>
          </div>
          <Link
            href="/dashboard/marketplace/mine"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-accentPurple/40 text-accentPurple hover:bg-accentPurple/10 text-sm font-bold transition-all whitespace-nowrap"
          >
            <BarChart3 className="w-4 h-4" />
            My Realms
          </Link>
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
                {/* Hero Banner for first Staff Pick */}
                {staffPicks.length > 0 && (() => {
                  const hero = staffPicks[0];
                  const theme = GAME_THEMES[hero.gameSlug.toUpperCase()] || GAME_THEMES.MINECRAFT;
                  
                  return (
                    <div 
                      className="relative rounded-3xl overflow-hidden mb-12 border border-white/10 group cursor-pointer animate-fade-in shadow-2xl"
                      onClick={() => setSelectedTemplate(hero)}
                    >
                      {/* Background Effects */}
                      <div className="absolute inset-0 bg-[#060a14]" />
                      <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-20 group-hover:opacity-30 transition-opacity duration-700`} />
                      <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/5 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000" />
                      
                      <div className="relative z-10 flex flex-col md:flex-row items-center p-8 md:p-12 gap-8 md:gap-12">
                        {/* Icon */}
                        <div className={`w-32 h-32 rounded-3xl ${theme.bg} ${theme.border} border-2 flex items-center justify-center text-7xl flex-shrink-0 shadow-[0_0_40px_rgba(0,0,0,0.5)] group-hover:scale-105 group-hover:rotate-3 transition-transform duration-500`}>
                          {theme.icon}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 text-center md:text-left">
                          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-4">
                            <span className="px-3 py-1 rounded-full bg-accentPurple/20 text-accentPurple text-xs font-extrabold uppercase tracking-widest border border-accentPurple/20 flex items-center gap-1.5 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                              <Sparkles className="w-3.5 h-3.5" /> Featured Template
                            </span>
                            <span className={`text-xs font-bold uppercase tracking-wider ${theme.text}`}>
                              {hero.gameSlug}
                            </span>
                            {hero.verifiedLevel === 'OFFICIAL' && (
                              <span title="Official" className="flex items-center gap-1 text-xs text-emerald-400 font-bold bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/20">
                                <ShieldCheck className="w-3.5 h-3.5" /> Official
                              </span>
                            )}
                          </div>
                          
                          <h2 className="text-3xl md:text-5xl font-black text-white mb-4 leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all">
                            {hero.name}
                          </h2>
                          
                          <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-6 max-w-2xl line-clamp-2">
                            {hero.description}
                          </p>
                          
                          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                            <button className="px-8 py-3.5 rounded-xl bg-white text-black hover:bg-slate-200 text-sm font-extrabold transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                              View Details
                            </button>
                            <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                              <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                                <Download className="w-4 h-4 text-emerald-400" /> {formatCount(hero.downloads)}
                              </span>
                              <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                                <ThumbsUp className="w-4 h-4 text-blue-400" /> {formatCount(hero.likes)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Staff Picks Carousel */}
                {staffPicks.length > 1 && (
                  <section className="mb-12">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                        <Crown className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="font-black text-xl text-white">Staff Picks</h3>
                        <p className="text-xs text-mutedText mt-0.5">Curated templates for immediate deployment</p>
                      </div>
                    </div>

                    <div className="flex gap-5 overflow-x-auto pb-6 -mx-2 px-2 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      {staffPicks.slice(1).map((t, i) => renderTemplateCard(t, i, true))}
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
            <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col gap-6 sticky top-8 h-fit">
              {/* Sort */}
              <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5 backdrop-blur-md shadow-lg">
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
                <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5 backdrop-blur-md shadow-lg">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-4 flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" /> Games
                  </span>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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
                <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5 backdrop-blur-md shadow-lg">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-4 flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5" /> Tags
                  </span>
                  <div className="space-y-1 max-h-64 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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
            <div className="flex-1 min-w-0 space-y-6">
              {/* Search Bar */}
              <div className="relative group">
                <div className="absolute inset-0 bg-accentPurple/20 rounded-2xl blur-xl group-focus-within:bg-accentPurple/30 transition-all duration-500" />
                <div className="relative flex flex-col sm:flex-row gap-3 bg-slate-950/80 border border-white/10 p-2 rounded-2xl backdrop-blur-md">
                  <div className="relative flex-1 flex items-center">
                    <Search className="w-5 h-5 text-accentPurple absolute left-4" />
                    <input
                      type="text"
                      placeholder="Search templates, authors, or games..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 pr-4 py-3.5 text-base rounded-xl bg-transparent text-slate-100 outline-none w-full font-medium placeholder-slate-500"
                    />
                    {isSearching && (
                      <Loader2 className="w-5 h-5 text-accentPurple absolute right-4 animate-spin" />
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
                  <div className="flex items-center gap-2 mt-4 px-4 pb-2">
                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Filtered by:</span>
                    {selectedGame && (
                      <button onClick={() => setSelectedGame("")} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accentPurple/20 border border-accentPurple/30 text-accentPurple text-[10px] font-bold hover:bg-accentPurple/30 transition-colors uppercase">
                        {selectedGame} <X className="w-3 h-3" />
                      </button>
                    )}
                    {selectedCategory && (
                      <button onClick={() => setSelectedCategory("")} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-bold hover:bg-blue-500/30 transition-colors capitalize">
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
            <div className="relative p-8 flex justify-between items-start border-b border-white/10 overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-br ${GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.gradient || 'from-slate-600 to-slate-900'} opacity-20`} />
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
              
              <div className="relative z-10 flex items-center gap-6">
                <div className={`w-20 h-20 rounded-2xl ${GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.bg || 'bg-white/5'} ${GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.border || 'border-white/10'} border-2 flex items-center justify-center text-4xl flex-shrink-0 shadow-xl`}>
                  {GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.icon || '🎮'}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black text-white tracking-tight">{selectedTemplate.name}</h2>
                    <div className="flex gap-2">
                      {selectedTemplate.verifiedLevel === 'OFFICIAL' && <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2.5 py-1 rounded-full font-extrabold tracking-widest uppercase border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]">Official</span>}
                      {selectedTemplate.verifiedLevel === 'VERIFIED' && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2.5 py-1 rounded-full font-extrabold tracking-widest uppercase border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)]">Verified</span>}
                    </div>
                  </div>
                  <p className="text-sm text-slate-300 mt-2 flex items-center gap-2 font-medium">
                    <span className={GAME_THEMES[selectedTemplate.gameSlug.toUpperCase()]?.text || 'text-slate-400 font-bold'}>{selectedTemplate.gameSlug}</span>
                    <span className="text-white/20">•</span>
                    by <span className="text-white font-bold">{selectedTemplate.author}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => { setSelectedTemplate(null); setShowSecurityReport(false); }} className="relative z-10 text-slate-400 hover:text-white transition-all p-2 bg-black/40 hover:bg-black/60 rounded-xl backdrop-blur-md border border-white/10">
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
              <div className="p-8 overflow-y-auto flex-1 space-y-8 bg-[#0b0e14]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 flex flex-col items-center justify-center shadow-lg backdrop-blur-sm">
                    <Download className="w-6 h-6 text-emerald-400 mb-2" />
                    <span className="font-black text-lg text-white">{formatCount(selectedTemplate.downloads)}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Deploys</span>
                  </div>
                  <div 
                    className={`p-4 rounded-2xl border flex flex-col items-center justify-center cursor-pointer transition-all shadow-lg backdrop-blur-sm ${
                      selectedTemplate.userVote === 'LIKE' ? 'bg-accentPurple/10 border-accentPurple/30 text-accentPurple shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-slate-900/50 border-white/5 hover:border-white/10 hover:bg-slate-800/50'
                    }`}
                    onClick={() => handleVote(selectedTemplate.id, selectedTemplate.userVote === 'LIKE' ? 'NONE' : 'LIKE')}
                  >
                    <ThumbsUp className={`w-6 h-6 mb-2 ${selectedTemplate.userVote === 'LIKE' ? 'text-accentPurple' : 'text-blue-400'}`} />
                    <span className="font-black text-lg text-white">{formatCount(selectedTemplate.likes)}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Likes</span>
                  </div>
                  <div 
                    className={`p-4 rounded-2xl border flex flex-col items-center justify-center cursor-pointer transition-all shadow-lg backdrop-blur-sm ${
                      selectedTemplate.userVote === 'DISLIKE' ? 'bg-red-500/10 border-red-500/30 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'bg-slate-900/50 border-white/5 hover:border-white/10 hover:bg-slate-800/50'
                    }`}
                    onClick={() => handleVote(selectedTemplate.id, selectedTemplate.userVote === 'DISLIKE' ? 'NONE' : 'DISLIKE')}
                  >
                    <ThumbsDown className={`w-6 h-6 mb-2 ${selectedTemplate.userVote === 'DISLIKE' ? 'text-red-400' : 'text-rose-400'}`} />
                    <span className="font-black text-lg text-white">{formatCount(selectedTemplate.dislikes)}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Dislikes</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 flex flex-col items-center justify-center shadow-lg backdrop-blur-sm">
                    <Clock className="w-6 h-6 text-slate-400 mb-2" />
                    <span className="font-black text-lg text-white">{timeAgo(selectedTemplate.createdAt)}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Added</span>
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
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-3 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5" /> What's Included
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {(() => {
                      const payload = JSON.parse(selectedTemplate.payload);
                      return (
                        <>
                          <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 shadow-lg backdrop-blur-sm relative overflow-hidden group">
                            <div className="absolute inset-0 bg-accentPurple/5 group-hover:bg-accentPurple/10 transition-colors" />
                            <Package className="w-5 h-5 text-accentPurple mb-2 relative z-10" />
                            <p className="text-xs font-bold text-white mb-0.5 relative z-10">Mods & Plugins</p>
                            <p className="text-[11px] text-slate-400 font-medium relative z-10">{payload.mods?.length || 0} packages</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 shadow-lg backdrop-blur-sm relative overflow-hidden group">
                            <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors" />
                            <Settings className="w-5 h-5 text-blue-400 mb-2 relative z-10" />
                            <p className="text-xs font-bold text-white mb-0.5 relative z-10">Config Overrides</p>
                            <p className="text-[11px] text-slate-400 font-medium relative z-10">{payload.configOverrides?.length || 0} files modified</p>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 shadow-lg backdrop-blur-sm relative overflow-hidden group">
                            <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors" />
                            <Terminal className="w-5 h-5 text-emerald-400 mb-2 relative z-10" />
                            <p className="text-xs font-bold text-white mb-0.5 relative z-10">Startup Params</p>
                            <p className="text-[11px] text-slate-400 font-medium relative z-10">{Object.keys(payload.startupParams || {}).length} variables</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="p-6 border-t border-white/10 bg-slate-900 flex justify-end gap-3 rounded-b-2xl mt-auto shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
              <button 
                onClick={() => { setSelectedTemplate(null); setShowSecurityReport(false); }}
                className="px-6 py-3 rounded-xl font-bold text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                disabled={deploying}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDeploy(selectedTemplate)}
                disabled={deploying}
                className="relative overflow-hidden group flex items-center gap-2 px-8 py-3 rounded-xl font-extrabold text-sm bg-accentPurple hover:bg-accentPurpleHover text-white shadow-lg shadow-accentPurple/25 transition-all disabled:opacity-50"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                {deploying ? (
                  <><Loader2 className="w-5 h-5 animate-spin relative z-10" /> <span className="relative z-10">Deploying...</span></>
                ) : (
                  <><Download className="w-5 h-5 relative z-10" /> <span className="relative z-10">{showSecurityReport ? "Approve & Deploy" : "One-Click Deploy"}</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

