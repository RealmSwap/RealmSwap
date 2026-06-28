"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  LayoutDashboard,
  Plus,
  LogOut,
  Users,
  History,
  Terminal,
  Settings,
  Clock,
  Search,
  Play,
  Pause,
  Send,
  X,
  FolderOpen,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";
import { useToast } from "@/components/ToastProvider";

interface ConsoleViewProps {
  servers: any[];
  user: any;
}

export default function ConsoleView({ servers, user }: ConsoleViewProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("server");
  const [selectedServer, setSelectedServer] = useState<any | null>(
    servers.find(s => s.id === initialServerId) || servers[0] || null
  );

  // Console State
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [consolePaused, setConsolePaused] = useState(false);
  const [consoleSearch, setConsoleSearch] = useState("");
  const [consoleConn, setConsoleConn] = useState<"connecting" | "live">("connecting");
  const [pendingCount, setPendingCount] = useState(0);
  const [consoleCommand, setConsoleCommand] = useState("");
  const [consoleCommandError, setConsoleCommandError] = useState<string | null>(null);
  
  const consolePausedRef = useRef(false);
  const pendingLinesRef = useRef<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  const MAX_CONSOLE_LINES = 5000;
  const capLines = (lines: string[]) =>
    lines.length > MAX_CONSOLE_LINES ? lines.slice(-MAX_CONSOLE_LINES) : lines;

  useEffect(() => {
    consolePausedRef.current = consolePaused;
  }, [consolePaused]);

  // Live log stream (SSE, file-tailing backend)
  useEffect(() => {
    if (!selectedServer) {
      setConsoleLines([]);
      pendingLinesRef.current = [];
      setPendingCount(0);
      setConsolePaused(false);
      setConsoleSearch("");
      setConsoleCommand("");
      setConsoleCommandError(null);
      return;
    }

    setConsoleConn("connecting");
    setConsoleLines([]);
    pendingLinesRef.current = [];
    setPendingCount(0);
    autoScrollRef.current = true;

    const es = new EventSource(`/api/servers/${selectedServer.id}/logs/stream`);
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
  }, [selectedServer]);

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

  // Send a console command to the running server's stdin
  const handleSendConsoleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = consoleCommand.trim();
    if (!cmd || !selectedServer) return;
    setConsoleCommand("");
    setConsoleCommandError(null);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to send command");
      }
    } catch (err: any) {
      setConsoleCommandError(err.message);
    }
  };

  const handleOpenServerFolder = async (serverId: string) => {
    try {
      const res = await fetch("/api/system/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId }),
      });
      const data = await res.json();
      if (!data.ok) addToast("error", data.error || "Could not open server folder");
    } catch {
      addToast("error", "Could not open server folder");
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

            {DASHBOARD_NAV_LINKS.map((link, i) => {
              const active = link.href === "/dashboard/console";
              return (
                <Link
                  key={i}
                  href={link.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all group ${
                    active
                      ? "bg-accentPurple/10 text-white border border-accentPurple/20"
                      : "hover:bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <link.icon className={`w-4 h-4 ${active ? "text-accentPurple" : "text-slate-500 group-hover:text-white transition-colors"}`} />
                    <span>{link.label}</span>
                  </div>
                </Link>
              );
            })}
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
      <main className="flex-1 overflow-y-auto px-6 py-8 flex flex-col">
        {/* Navigation back */}
        <div className="mb-6 flex-shrink-0">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8 flex-shrink-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <Terminal className="w-6 h-6 text-accentPurple animate-float" />
            <span>Live Server Console</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">View live output streams and execute commands instantly on your server.</p>
        </div>

        {/* Server Selector Bar */}
        <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 flex-shrink-0">
          <div>
            <span className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-1">Active Server Target</span>
            <span className="text-[11px] text-mutedText">Select which local game server console to monitor.</span>
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

        {/* Console Viewer */}
        {selectedServer ? (
          <div className="flex-1 glass-panel-purple border border-accentPurple/30 rounded-2xl p-6 shadow-2xl flex flex-col box-glow-purple min-h-[500px]">
            
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
              {selectedServer?.runnerType === "LOCAL" && (
                <button
                  onClick={() => handleOpenServerFolder(selectedServer.id)}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition-all"
                  title="Open this server's files on disk"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Files</span>
                </button>
              )}
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

            {/* Command Input */}
            <form onSubmit={handleSendConsoleCommand} className="flex gap-2 mt-3 flex-shrink-0">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-500 font-bold text-xs">{">"}</span>
                <input
                  type="text"
                  value={consoleCommand}
                  onChange={(e) => setConsoleCommand(e.target.value)}
                  placeholder={selectedServer.status !== "RUNNING" ? "Server must be running to send commands… (Wait for live stream)" : "Enter console command…"}
                  disabled={consoleConn !== "live"}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-accentPurple/40 outline-none text-xs font-mono text-slate-200 placeholder:text-mutedText disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <button
                type="submit"
                disabled={consoleConn !== "live" || !consoleCommand.trim()}
                className="px-4 py-2 rounded-lg bg-accentPurple/80 hover:bg-accentPurple disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>

            {/* Console Footer */}
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5 flex-shrink-0">
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
                {consoleCommandError && (
                  <span className="text-red-400 ml-2">• {consoleCommandError}</span>
                )}
              </span>
              <span className="text-[10px] text-mutedText">{consoleLines.length} lines</span>
            </div>

          </div>
        ) : (
          <div className="text-center p-8 text-mutedText">No server selected to view console.</div>
        )}
      </main>
    </div>
  );
}
