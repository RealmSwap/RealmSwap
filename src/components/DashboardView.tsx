"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Server as ServerIcon, 
  Archive, 
  Cpu, 
  Database, 
  Layers, 
  RefreshCw, 
  Play, 
  Square, 
  Trash2, 
  FolderSync, 
  Plus, 
  Copy, 
  Check, 
  Clock, 
  LogOut, 
  Users, 
  BadgeCent, 
  Wrench, 
  History, 
  LayoutDashboard,
  MapPin,
  AlertCircle,
  Terminal,
  Pause,
  Search,
  X,
  Download,
  Settings
} from "lucide-react";

interface DashboardViewProps {
  initialData: {
    user: any;
    servers: any[];
    archives: any[];
    activityLogs: any[];
    slots: {
      used: number;
      total: number;
      remaining: number;
    };
  };
}

export default function DashboardView({ initialData }: DashboardViewProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // "server-id" or "archive-id"
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Console Modal State
  const [activeConsoleServer, setActiveConsoleServer] = useState<any | null>(null);
  // Live console (SSE) state
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [consolePaused, setConsolePaused] = useState(false);
  const [consoleSearch, setConsoleSearch] = useState("");
  const [consoleConn, setConsoleConn] = useState<"connecting" | "live">("connecting");
  const [pendingCount, setPendingCount] = useState(0);
  const consolePausedRef = useRef(false);
  const pendingLinesRef = useRef<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  const MAX_CONSOLE_LINES = 5000;
  const capLines = (lines: string[]) =>
    lines.length > MAX_CONSOLE_LINES ? lines.slice(-MAX_CONSOLE_LINES) : lines;

  // Import Map Modal State
  const [importMapServer, setImportMapServer] = useState<any | null>(null);
  const [importWorldPath, setImportWorldPath] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Stats history for sparklines
  const [serverStats, setServerStats] = useState<Record<string, { cpu: number[]; memory: number[] }>>({});

  // Live install/download progress for STARTING/UPDATING servers
  const [progressMap, setProgressMap] = useState<
    Record<string, { phase: string; percent: number | null; label: string } | null>
  >({});

  // Poll database for updates (live stats fluctuation)
  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const res = await fetch("/api/servers");
        if (res.ok) {
          const updated = await res.json();
          setData(updated);
        }
      } catch (err) {
        console.error("Error polling server states:", err);
      }
    };

    const interval = setInterval(fetchUpdates, 8000); // Poll every 8s
    return () => clearInterval(interval);
  }, []);

  // Keep the paused flag readable inside the EventSource handler closure
  useEffect(() => {
    consolePausedRef.current = consolePaused;
  }, [consolePaused]);

  // Live log stream for the active console modal (SSE)
  useEffect(() => {
    if (!activeConsoleServer) {
      setConsoleLines([]);
      pendingLinesRef.current = [];
      setPendingCount(0);
      setConsolePaused(false);
      setConsoleSearch("");
      return;
    }

    setConsoleConn("connecting");
    setConsoleLines([]);
    pendingLinesRef.current = [];
    setPendingCount(0);
    autoScrollRef.current = true;

    const es = new EventSource(`/api/servers/${activeConsoleServer.id}/logs/stream`);
    es.onopen = () => setConsoleConn("live");
    es.onerror = () => setConsoleConn("connecting"); // EventSource auto-reconnects
    es.onmessage = (e) => {
      const incoming = e.data.split("\n");
      if (consolePausedRef.current) {
        pendingLinesRef.current = capLines([...pendingLinesRef.current, ...incoming]);
        setPendingCount(pendingLinesRef.current.length);
      } else {
        setConsoleLines((prev) => capLines([...prev, ...incoming]));
      }
    };

    return () => es.close();
  }, [activeConsoleServer]);

  // Auto-scroll to the bottom on new lines unless the user scrolled up
  useEffect(() => {
    if (autoScrollRef.current && logContainerRef.current) {
      const el = logContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [consoleLines]);

  const handleConsoleScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const toggleConsolePause = () => {
    if (consolePausedRef.current) {
      // Resuming: capture the buffered lines BEFORE clearing the ref, then
      // flush. Reading pendingLinesRef inside the deferred setConsoleLines
      // updater would see the already-emptied ref, so capture it locally.
      const pending = pendingLinesRef.current;
      pendingLinesRef.current = [];
      setPendingCount(0);
      setConsolePaused(false);
      if (pending.length > 0) {
        setConsoleLines((cur) => capLines([...cur, ...pending]));
      }
      autoScrollRef.current = true;
      requestAnimationFrame(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      });
    } else {
      setConsolePaused(true);
    }
  };

  // Poll stats for running servers
  useEffect(() => {
    const fetchStats = async () => {
      const running = data.servers.filter((s: any) => s.status === "RUNNING");
      for (const server of running) {
        try {
          const res = await fetch(`/api/servers/${server.id}/stats`);
          if (res.ok) {
            const stats = await res.json();
            setServerStats(prev => ({ ...prev, [server.id]: { cpu: stats.cpu, memory: stats.memory } }));
          }
        } catch (e) {}
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [data.servers]);

  // Poll install/download progress for servers that are STARTING or UPDATING
  useEffect(() => {
    const inProgress = data.servers.filter(
      (s: any) => s.status === "STARTING" || s.status === "UPDATING"
    );
    if (inProgress.length === 0) {
      return;
    }
    const fetchProgress = async () => {
      for (const server of inProgress) {
        try {
          const res = await fetch(`/api/servers/${server.id}/progress`);
          if (res.ok) {
            const body = await res.json();
            setProgressMap((prev) => ({ ...prev, [server.id]: body.progress }));
          }
        } catch (e) {}
      }
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 1500);
    return () => clearInterval(interval);
  }, [data.servers]);

  // Update game server handler
  const handleUpdateServer = async (serverId: string) => {
    setActionLoading(`${serverId}-update`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/update`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to start update");
      const stateRes = await fetch("/api/servers");
      if (stateRes.ok) { const fresh = await stateRes.json(); setData(fresh); }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
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

  // Power action: START, STOP, RESTART
  const handlePowerAction = async (serverId: string, action: "start" | "stop" | "restart") => {
    setActionLoading(`${serverId}-${action}`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/${action}`, {
        method: "POST",
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || `Failed to ${action} server`);

      // Update local state immediately
      setData(prev => ({
        ...prev,
        servers: prev.servers.map(s => s.id === serverId ? updated : s)
      }));

      // Force refresh logs shortly after
      const logRes = await fetch("/api/servers");
      if (logRes.ok) {
        const fresh = await logRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Archive / Vault Server
  const handleArchiveServer = async (serverId: string) => {
    setActionLoading(`${serverId}-archive`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/archive`, {
        method: "POST",
      });
      const archive = await res.json();
      if (!res.ok) throw new Error(archive.error || "Failed to vault server");

      // Refetch whole state because a server was deleted and an archive created
      const stateRes = await fetch("/api/servers");
      if (stateRes.ok) {
        const fresh = await stateRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Restore Archive
  const handleRestoreArchive = async (archiveId: string) => {
    setActionLoading(`${archiveId}-restore`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/archives/${archiveId}/restore`, {
        method: "POST",
      });
      const restored = await res.json();
      if (!res.ok) throw new Error(restored.error || "Failed to restore server");

      // Refetch whole state
      const stateRes = await fetch("/api/servers");
      if (stateRes.ok) {
        const fresh = await stateRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete Archive
  const handleDeleteArchive = async (archiveId: string) => {
    if (!confirm("Are you sure you want to permanently delete this vaulted game world? This cannot be undone.")) return;
    setActionLoading(`${archiveId}-delete`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/archives/${archiveId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete archive");
      }

      // Refetch whole state
      const stateRes = await fetch("/api/servers");
      if (stateRes.ok) {
        const fresh = await stateRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Import World
  const handleImportWorld = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importMapServer) return;
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const res = await fetch(`/api/servers/${importMapServer.id}/import-world`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: importWorldPath }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to import world");

      setImportSuccess(resData.message || "Map imported successfully!");
      setImportWorldPath("");
      
      // Refresh system activity logs
      const stateRes = await fetch("/api/servers");
      if (stateRes.ok) {
        const fresh = await stateRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  // Helper for game icons
  const getGameIcon = (game: string) => {
    switch (game.toUpperCase()) {
      case "MINECRAFT": return "⛏️";
      case "VALHEIM": return "⛵";
      case "ENSHROUDED": return "🔥";
      case "ZOMBOID": return "🧟";
      case "ARK": return "🦖";
      case "TERRARIA": return "🌳";
      case "PALWORLD": return "🦊";
      case "RUST": return "⚙️";
      default: return "🎮";
    }
  };

  // SVG Sparkline component
  const Sparkline = ({ data: points, color, height = 24, width = 100 }: { data: number[]; color: string; height?: number; width?: number }) => {
    if (!points || points.length < 2) return <div style={{ width, height }} className="bg-white/5 rounded" />;
    const max = Math.max(...points, 1);
    const pathPoints = points.map((v, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg width={width} height={height} className="inline-block">
        <polyline points={pathPoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  };

  // Aggregate Vault metrics
  const totalVaultSize = data.archives.reduce((acc, cur) => acc + cur.saveSizeGB, 0).toFixed(2);

  return (
    <div className="min-h-screen flex bg-background text-slate-100 font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>

          {/* Local Status Card */}
          <div className="p-4 border-b border-borderDark bg-slate-950/20">
            <div className="flex justify-between text-xs mb-1.5 font-bold">
              <span className="text-mutedText">Local Server Runner</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVE
              </span>
            </div>
            <span className="text-[10px] text-mutedText block leading-normal">
              Hosting from your PC is completely free and unlimited. Make sure to keep the runner app running while friends are playing.
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <Link 
              href="/dashboard" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold bg-accentPurple/10 text-white border border-accentPurple/20"
            >
              <LayoutDashboard className="w-4 h-4 text-accentPurple" />
              <span>Dashboard</span>
            </Link>
            
            <Link 
              href="/dashboard/servers/new" 
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-4 h-4 text-mutedText group-hover:text-white transition-colors" />
                <span>Create Server</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">Unlimited</span>
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
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-400 hover:text-white transition-all group"
              >
                <div className="flex items-center gap-3">
                  <link.icon className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
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
              <span className="font-bold text-sm block truncate text-slate-200">{data.user.name}</span>
              <span className="text-xs text-mutedText block truncate">{data.user.email}</span>
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

      {/* Main Dashboard Area */}
      <main className="flex-1 overflow-y-auto px-6 py-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Welcome back, {data.user.name.split(" ")[0]}</h1>
            <p className="text-sm text-mutedText mt-1">Manage your local game servers and swap world archives effortlessly.</p>
          </div>
          
          <Link 
            href="/dashboard/servers/new" 
            className="inline-flex items-center gap-2 bg-accentPurple hover:bg-accentPurpleHover text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-accentPurple/10 border border-accentPurple/30"
          >
            <Plus className="w-4 h-4" />
            <span>Deploy Server</span>
          </Link>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3 animate-slide-down">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-bold block">Operation Failed</span>
              <span>{errorMessage}</span>
            </div>
            <button 
              onClick={() => setErrorMessage(null)} 
              className="text-xs hover:underline text-mutedText hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Aggregate Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Local Running Servers", val: `${data.servers.filter(s => s.status === 'RUNNING').length}`, desc: "Free & unlimited hosting", icon: ServerIcon },
            { label: "Vaulted Worlds", val: `${data.archives.length}`, desc: "Unlimited storage capacity", icon: Archive },
            { label: "Vault Size", val: `${totalVaultSize} GB`, desc: "Securely compressed maps", icon: Database },
            { label: "Global Ping", val: "12 ms", desc: "Optimal routing active", icon: Cpu }
          ].map((stat, i) => (
            <div key={i} className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-mutedText block mb-1 uppercase tracking-wider">{stat.label}</span>
                <span className="text-2xl font-extrabold text-white block">{stat.val}</span>
                <span className="text-[10px] text-mutedText block mt-0.5">{stat.desc}</span>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <stat.icon className="w-5 h-5 text-accentPurple" />
              </div>
            </div>
          ))}
        </div>

        {/* Slot Bay Tracker (visualizing active slot status) */}
        <section className="mb-8">
          <h2 className="text-xs font-bold text-mutedText uppercase tracking-wider mb-3">Active Server Bay</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Active Servers Loop */}
            {data.servers.map((server) => {
              const loadingKey = actionLoading?.split("-")[0];
              const isServerLoading = loadingKey === server.id;
              const isRunning = server.status === "RUNNING";
              const isLocal = server.runnerType === "LOCAL";

              return (
                <div 
                  key={server.id} 
                  className={`glass-panel rounded-xl border p-5 transition-all duration-300 hover:border-accentPurple/30 group relative overflow-hidden ${
                    isRunning ? "border-emerald-500/20 box-glow-purple" : "border-slate-800"
                  }`}
                >
                  {/* Game Accent Strip */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b ${
                    server.game === "MINECRAFT" ? "from-green-500 to-emerald-600" :
                    server.game === "VALHEIM" ? "from-amber-500 to-amber-600" :
                    server.game === "ZOMBOID" ? "from-red-500 to-rose-600" :
                    server.game === "ENSHROUDED" ? "from-blue-500 to-indigo-600" :
                    server.game === "ARK" ? "from-cyan-500 to-blue-600" :
                    server.game === "TERRARIA" ? "from-lime-500 to-green-600" :
                    server.game === "PALWORLD" ? "from-orange-500 to-rose-600" :
                    server.game === "RUST" ? "from-stone-500 to-red-600" :
                    "from-slate-500 to-slate-600"
                  }`}></div>

                  <div className="pl-3.5">
                    {/* Server Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gradient-to-br ${
                          server.game === "MINECRAFT" ? "from-green-600 to-emerald-800" :
                          server.game === "VALHEIM" ? "from-amber-600 to-amber-800" :
                          server.game === "ZOMBOID" ? "from-red-600 to-rose-800" :
                          server.game === "ENSHROUDED" ? "from-blue-600 to-indigo-800" :
                          server.game === "ARK" ? "from-cyan-600 to-blue-800" :
                          server.game === "TERRARIA" ? "from-lime-600 to-green-800" :
                          server.game === "PALWORLD" ? "from-orange-600 to-rose-800" :
                          server.game === "RUST" ? "from-stone-600 to-red-800" :
                          "from-slate-600 to-slate-800"
                        } shadow-md`}>
                          {getGameIcon(server.game)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-base text-white">{server.name}</h3>
                            <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                              isRunning ? "bg-emerald-500/10 text-emerald-400" :
                              server.status === "STARTING" ? "bg-purple-500/10 text-purple-400 animate-pulse" :
                              server.status === "UPDATING" ? "bg-blue-500/10 text-blue-400 animate-pulse" :
                              server.status === "CRASHED" ? "bg-red-500/10 text-red-400 animate-pulse" :
                              "bg-amber-500/10 text-amber-400"
                            }`}>
                              {server.status}
                            </span>
                            {isLocal && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-accentPurple/10 text-accentPurple border border-accentPurple/25">
                                LOCAL
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-mutedText block mt-0.5">{server.game} Server</span>
                        </div>
                      </div>

                      {/* IP and Port */}
                      <div className="text-right">
                        <span className="text-[10px] text-mutedText block">IP Address</span>
                        {!isLocal ? (
                          <div 
                            onClick={() => handleCopyIp(`${server.ipAddress}:${server.port}`)}
                            className="flex items-center gap-1.5 cursor-pointer bg-slate-950/60 px-2 py-1 rounded border border-white/5 hover:border-accentPurple/40 transition-colors mt-0.5 group"
                          >
                            <span className="font-mono text-xs text-slate-300">
                              {server.ipAddress}:{server.port}
                            </span>
                            {copiedIp === `${server.ipAddress}:${server.port}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-500 group-hover:text-accentPurple transition-colors" />
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1.5 mt-0.5">
                            {/* Loopback Address */}
                            <div 
                              onClick={() => handleCopyIp(`127.0.0.1:${server.port}`)}
                              className="flex items-center gap-1.5 cursor-pointer bg-slate-950/60 px-2 py-1 rounded border border-white/5 hover:border-accentPurple/40 transition-colors group"
                              title="Connect locally on this PC"
                            >
                              <span className="font-mono text-[11px] text-slate-300">
                                127.0.0.1:{server.port}
                              </span>
                              {copiedIp === `127.0.0.1:${server.port}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-500 group-hover:text-accentPurple transition-colors" />
                              )}
                            </div>

                            {/* Public WAN address or Join Code if UPnP / crossplay active */}
                            {isRunning && (server.enableUpnp || server.runnerType === "LOCAL") && server.ipAddress && server.ipAddress !== "127.0.0.1" && (
                              server.ipAddress.includes("Join Code:") ? (
                                <div 
                                  onClick={() => handleCopyIp(server.ipAddress.replace("Join Code: ", ""))}
                                  className="flex items-center gap-1.5 cursor-pointer bg-accentPurple/15 px-2 py-1 rounded border border-accentPurple/30 hover:border-accentPurple/55 transition-colors group animate-slide-down"
                                  title="Copy Join Code to share with friends"
                                >
                                  <span className="text-[9px] bg-accentPurple/25 text-accentPurple px-1.5 py-0.25 rounded font-extrabold mr-0.5 uppercase tracking-wide">Join Code</span>
                                  <span className="font-mono text-[11px] text-accentPurple font-bold">
                                    {server.ipAddress.replace("Join Code: ", "")}
                                  </span>
                                  {copiedIp === server.ipAddress.replace("Join Code: ", "") ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-accentPurple/60 group-hover:text-accentPurple transition-colors" />
                                  )}
                                </div>
                              ) : (
                                <div 
                                  onClick={() => handleCopyIp(`${server.ipAddress}:${server.port}`)}
                                  className="flex items-center gap-1.5 cursor-pointer bg-accentPurple/15 px-2 py-1 rounded border border-accentPurple/30 hover:border-accentPurple/55 transition-colors group animate-slide-down"
                                  title="Copy public address to share with friends"
                                >
                                  <span className="text-[9px] bg-accentPurple/25 text-accentPurple px-1.5 py-0.25 rounded font-extrabold mr-0.5 uppercase tracking-wide">Share</span>
                                  <span className="font-mono text-[11px] text-accentPurple font-bold">
                                    {server.ipAddress}:{server.port}
                                  </span>
                                  {copiedIp === `${server.ipAddress}:${server.port}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-accentPurple/60 group-hover:text-accentPurple transition-colors" />
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Live install/download progress */}
                    {(server.status === "STARTING" || server.status === "UPDATING") &&
                      progressMap[server.id] && (
                        <div className="mt-4">
                          <div className="flex items-center gap-1.5 mb-1.5 text-xs text-accentPurple font-medium">
                            <Download className="w-3.5 h-3.5" />
                            <span>{progressMap[server.id]!.label}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                            {progressMap[server.id]!.percent !== null ? (
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-accentPurple to-blue-500 transition-all duration-500"
                                style={{ width: `${progressMap[server.id]!.percent}%` }}
                              ></div>
                            ) : (
                              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-accentPurple to-blue-500 animate-pulse"></div>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Hardware meters with sparklines */}
                    <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-white/5">
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-mutedText flex items-center gap-1">
                            CPU Usage
                            {isRunning && <span className="w-1 h-1 rounded-full bg-accentPurple animate-pulse"></span>}
                          </span>
                          <span className="font-mono font-semibold text-slate-200">{server.cpuUsage}%</span>
                        </div>
                        <Sparkline data={serverStats[server.id]?.cpu || []} color="#a78bfa" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-mutedText flex items-center gap-1">
                            Memory ({server.ramAllocation}GB)
                            {isRunning && <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse"></span>}
                          </span>
                          <span className="font-mono font-semibold text-slate-200">{server.memoryUsage} GB</span>
                        </div>
                        <Sparkline data={serverStats[server.id]?.memory || []} color="#60a5fa" />
                      </div>
                    </div>

                    {/* Metadata & Controls */}
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
                      <div className="flex gap-4 text-xs text-mutedText">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-accentPurple" />
                          <span>{isLocal ? "LOCALHOST" : server.region}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-accentBlue" />
                          <span>{isLocal ? "PC Hardware" : "24/7 Node"}</span>
                        </span>
                        {server.password && (
                          <span className="flex items-center gap-1" title={`Server Password: ${server.password}`}>
                            <span className="text-[11px]">🔑</span>
                            <span className="font-mono bg-white/5 border border-white/10 px-1.5 py-0.25 rounded text-[10px] text-slate-300">
                              {server.password}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        {/* Start */}
                        <button
                          onClick={() => handlePowerAction(server.id, "start")}
                          disabled={isRunning || server.status === "STARTING" || isServerLoading}
                          className="p-2 rounded-lg bg-slate-900 border border-white/5 hover:border-emerald-500/40 text-slate-400 hover:text-emerald-400 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors"
                          title="Start Server"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                        
                        {/* Stop */}
                        <button
                          onClick={() => handlePowerAction(server.id, "stop")}
                          disabled={!isRunning || isServerLoading}
                          className="p-2 rounded-lg bg-slate-900 border border-white/5 hover:border-red-500/40 text-slate-400 hover:text-red-400 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors"
                          title="Stop Server"
                        >
                          <Square className="w-4 h-4 fill-current" />
                        </button>

                        {/* Restart */}
                        <button
                          onClick={() => handlePowerAction(server.id, "restart")}
                          disabled={!isRunning || isServerLoading}
                          className="p-2 rounded-lg bg-slate-900 border border-white/5 hover:border-accentBlue/40 text-slate-400 hover:text-accentBlue transition-colors"
                          title="Restart Server"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>

                        {/* Update (SteamCMD games only, when stopped) */}
                        {!isRunning && server.status !== "STARTING" && server.status !== "UPDATING" && server.game !== "MINECRAFT" && (
                          <button
                            onClick={() => handleUpdateServer(server.id)}
                            disabled={isServerLoading}
                            className="p-2 rounded-lg bg-slate-900 border border-white/5 hover:border-blue-500/40 text-slate-400 hover:text-blue-400 transition-colors"
                            title="Update Game Server via SteamCMD"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}

                        {/* Console logs toggle */}
                        <button
                          onClick={() => setActiveConsoleServer(server)}
                          className="p-2 rounded-lg bg-slate-900 border border-white/5 hover:border-accentPurple/40 text-slate-400 hover:text-accentPurple transition-colors"
                          title="View Console Output"
                        >
                          <Terminal className="w-4 h-4" />
                        </button>

                        {/* Archive / Vault */}
                        <button
                          onClick={() => handleArchiveServer(server.id)}
                          disabled={isServerLoading || server.status === "STARTING"}
                          className="px-3.5 py-2 rounded-lg bg-accentPurple/10 border border-accentPurple/20 hover:bg-accentPurple/20 text-accentPurple font-bold text-xs flex items-center gap-1.5 transition-all"
                          title="Vault Server (Archive State)"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>Vault</span>
                        </button>

                        {/* Import Map */}
                        {!isRunning && (
                          <button
                            onClick={() => {
                              setImportMapServer(server);
                              setImportWorldPath("");
                              setImportError(null);
                              setImportSuccess(null);
                            }}
                            disabled={isServerLoading || server.status === "STARTING"}
                            className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition-all"
                            title="Import existing local save maps"
                          >
                            <span>Import Map</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty Servers Fallback */}
            {data.servers.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-white/5 bg-slate-950/20 p-8 text-center flex flex-col items-center justify-center min-h-[225px]">
                <div className="p-3 bg-white/5 rounded-full border border-white/5 mb-3">
                  <ServerIcon className="w-6 h-6 text-slate-500" />
                </div>
                <span className="font-extrabold text-sm text-slate-300">No active servers</span>
                <span className="text-xs text-mutedText mt-1 max-w-sm">Create your first local dedicated game server to play multiplayer with friends for free.</span>
                <Link 
                  href="/dashboard/servers/new" 
                  className="mt-4 inline-flex items-center gap-1.5 bg-accentPurple hover:bg-accentPurpleHover text-white px-4 py-2 rounded-lg text-xs font-bold transition-all border border-accentPurple/30"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Server</span>
                </Link>
              </div>
            )}

          </div>
        </section>

        {/* The Game History Vault Archives */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-xs font-bold text-mutedText uppercase tracking-wider flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-accentPurple" />
              <span>The Game History Vault</span>
            </h2>
            <span className="text-[10px] text-mutedText">Unlimited archive slots</span>
          </div>

          <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
            {data.archives.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/20">
                <Archive className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <span className="font-bold text-sm block text-slate-400">Vault is empty</span>
                <span className="text-xs text-mutedText block mt-1">Once you archive a server slot, it will appear here.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-slate-950/30 text-mutedText text-xs uppercase tracking-wider">
                      <th className="p-4 font-bold">Game</th>
                      <th className="p-4 font-bold">World Name</th>
                      <th className="p-4 font-bold text-center">Save Footprint</th>
                      <th className="p-4 font-bold">Date Vaulted</th>
                      <th className="p-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.archives.map((archive) => {
                      const isArchiveLoading = actionLoading?.split("-")[0] === archive.id;

                      return (
                        <tr key={archive.id} className="hover:bg-white/5 transition-colors group">
                          {/* Game */}
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{getGameIcon(archive.game)}</span>
                              <span className="font-bold text-xs bg-slate-950 px-2 py-0.5 rounded border border-white/5">{archive.game}</span>
                            </div>
                          </td>

                          {/* World Name */}
                          <td className="p-4">
                            <span className="font-bold text-slate-200 group-hover:text-accentPurple transition-colors">{archive.serverName}</span>
                          </td>

                          {/* Save Footprint */}
                          <td className="p-4 text-center">
                            <span className="font-mono text-xs text-slate-300">{archive.saveSizeGB} {archive.saveSizeGB < 1 ? "MB" : "GB"}</span>
                          </td>

                          {/* Date Vaulted */}
                          <td className="p-4 text-xs text-mutedText">
                            {new Date(archive.archivedAt).toLocaleDateString(undefined, { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </td>

                          {/* Actions */}
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleRestoreArchive(archive.id)}
                                disabled={isArchiveLoading}
                                className="px-3 py-1.5 rounded-lg bg-accentBlue/10 border border-accentBlue/20 hover:bg-accentBlue/20 text-accentBlue font-bold text-xs flex items-center gap-1 transition-all disabled:opacity-40"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Restore</span>
                              </button>
                              <button
                                onClick={() => handleDeleteArchive(archive.id)}
                                disabled={isArchiveLoading}
                                className="p-2 rounded-lg bg-slate-900 border border-white/5 hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
                                title="Delete Archive permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Console / Audit Log Feed */}
        <section>
          <h2 className="text-xs font-bold text-mutedText uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-slate-500" />
            <span>Server Audit & Console logs</span>
          </h2>
          
          <div className="glass-panel p-5 rounded-xl border border-white/5 font-mono text-[11px] text-slate-300 max-h-60 overflow-y-auto space-y-2.5 bg-slate-950/40">
            {data.activityLogs.length === 0 ? (
              <span className="text-mutedText">No recent system logs available.</span>
            ) : (
              data.activityLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <span className="text-mutedText flex-shrink-0">
                    [{new Date(log.createdAt).toLocaleTimeString()}]
                  </span>
                  <span className="text-accentPurple font-bold flex-shrink-0">
                    [{log.action}]
                  </span>
                  <span className="text-slate-200">
                    {log.details}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

      </main>

      {/* Terminal Console Dialog Overlay */}
      {activeConsoleServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-3xl glass-panel-purple border border-accentPurple/30 rounded-2xl p-6 shadow-2xl flex flex-col h-[500px] box-glow-purple">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`w-3 h-3 rounded-full ${activeConsoleServer.status === "RUNNING" ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-pulse"}`}></div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Server Console Output</h3>
                  <p className="text-xs text-mutedText">
                    {activeConsoleServer.name} ({activeConsoleServer.game}) • {activeConsoleServer.runnerType.toLowerCase()} runner
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setActiveConsoleServer(null)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Console Toolbar */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-mutedText absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={consoleSearch}
                  onChange={(e) => setConsoleSearch(e.target.value)}
                  placeholder="Filter logs…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-accentPurple/40 outline-none text-xs text-slate-200 placeholder:text-mutedText"
                />
              </div>
              <button
                onClick={toggleConsolePause}
                className="px-3 py-2 rounded-lg bg-slate-900 border border-white/10 hover:border-white/20 text-xs font-bold text-slate-300 transition-colors flex items-center gap-1.5"
              >
                {consolePaused ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Resume
                    {pendingCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accentPurple/30 text-[10px] text-white">
                        {pendingCount}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                )}
              </button>
            </div>

            {/* Log Terminal Screen */}
            <div
              ref={logContainerRef}
              onScroll={handleConsoleScroll}
              className="flex-1 bg-black/90 border border-white/5 rounded-xl p-4 font-mono text-[11px] text-emerald-400 overflow-y-auto whitespace-pre-wrap select-text selection:bg-emerald-500/20 scrollbar-thin"
            >
              {(() => {
                const visible = consoleSearch
                  ? consoleLines.filter((l) =>
                      l.toLowerCase().includes(consoleSearch.toLowerCase())
                    )
                  : consoleLines;
                if (visible.length === 0) {
                  return consoleSearch
                    ? "No lines match the filter."
                    : "Initializing console stream…";
                }
                return visible.join("\n");
              })()}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
              <span className="text-[10px] text-mutedText flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    consoleConn === "live"
                      ? "bg-emerald-400 animate-ping"
                      : "bg-amber-400 animate-pulse"
                  }`}
                ></span>
                {consoleConn === "live"
                  ? consolePaused
                    ? "Live stream paused"
                    : "Live stream connected (SSE)"
                  : "Connecting…"}
              </span>
              <span className="text-[10px] text-mutedText">
                {consoleLines.length} lines
              </span>
            </div>

          </div>
        </div>
      )}
      {/* Import Map Dialog Overlay */}
      {importMapServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg glass-panel border border-emerald-500/30 rounded-2xl p-6 shadow-2xl flex flex-col box-glow-emerald">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div>
                <h3 className="font-extrabold text-white text-base">Import Existing Map</h3>
                <p className="text-xs text-mutedText">
                  Copy world save data into {importMapServer.name} ({importMapServer.game})
                </p>
              </div>
              <button 
                onClick={() => setImportMapServer(null)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Help guidelines */}
            <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-xs text-slate-300 leading-normal space-y-2 mb-4">
              <span className="font-bold text-white block">Instructions:</span>
              {importMapServer.game === "MINECRAFT" && (
                <p>
                  Minecraft requires a world folder path. Select the folder on your host PC that contains the **`level.dat`** file.<br/>
                  *Example:* `C:\Users\YourName\AppData\Roaming\.minecraft\saves\MyWorld`
                </p>
              )}
              {importMapServer.game === "VALHEIM" && (
                <p>
                  Valheim requires a path to a **`.db`** or **`.fwl`** file (the paired file is auto-imported if present), or a directory containing them.<br/>
                  *Example:* `C:\Users\YourName\AppData\LocalLow\IronGate\Valheim\worlds_local\MyWorld.db`
                </p>
              )}
              {importMapServer.game === "ENSHROUDED" && (
                <p>
                  Enshrouded savegames can be imported as files or save folders containing your game files.<br/>
                  *Example:* `C:\Users\YourName\AppData\Roaming\Enshrouded\savegame`
                </p>
              )}
              {importMapServer.game === "ZOMBOID" && (
                <p>
                  Project Zomboid world saves must be folders containing sandbox configurations and map database structures.<br/>
                  *Example:* `C:\Users\YourName\Zomboid\Saves\Multiplayer\servertest`
                </p>
              )}
              {importMapServer.game === "ARK" && (
                <p>
                  ARK save paths should be folders containing your active island save databases.<br/>
                  *Example:* `D:\Steam\steamapps\common\ARK\ShooterGame\Saved\SavedArks`
                </p>
              )}
              {importMapServer.game === "TERRARIA" && (
                <p>Terraria requires a world file (`.wld`) or a folder containing `.wld` files.<br/>*Example:* `C:\Users\YourName\Documents\My Games\Terraria\Worlds\MyWorld.wld`</p>
              )}
              {importMapServer.game === "PALWORLD" && (
                <p>Palworld saves should be a folder containing SaveGames data.<br/>*Example:* `C:\Users\YourName\AppData\Local\Pal\Saved\SaveGames`</p>
              )}
              {importMapServer.game === "RUST" && (
                <p>Rust save data should be a folder containing your server identity folder.<br/>*Example:* `D:\Steam\steamapps\common\RustDedicated\server\servertest`</p>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleImportWorld} className="space-y-4">
              {importError && (
                <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs leading-normal">
                  {importError}
                </div>
              )}

              {importSuccess && (
                <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs leading-normal">
                  {importSuccess}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-2">
                  Source Save Path on Host PC
                </label>
                <input
                  type="text"
                  value={importWorldPath}
                  onChange={(e) => setImportWorldPath(e.target.value)}
                  placeholder="Paste the absolute path to your file or directory..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all duration-200 text-xs text-slate-200"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setImportMapServer(null)}
                  className="px-4 py-2.5 rounded-lg bg-slate-900 border border-white/5 hover:border-white/10 text-xs font-bold text-slate-300 transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={importLoading}
                  className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors border border-emerald-500/30"
                >
                  {importLoading ? "Copying Saves..." : "Import Saves"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
