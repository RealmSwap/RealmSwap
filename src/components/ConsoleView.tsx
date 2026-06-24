"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Terminal,
  LayoutDashboard,
  LogOut,
  Plus,
  Play,
  Square,
  Wrench,
  FolderSync,
  Settings,
  Users,
  History,
  AlertCircle,
  Pause,
  Send,
  ChevronDown
} from "lucide-react";

export default function ConsoleView({ user, servers }: { user: any, servers: any[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("serverId");

  const [activeServerId, setActiveServerId] = useState<string>(initialServerId || (servers.length > 0 ? servers[0].id : ""));
  const [logs, setLogs] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeServer = servers.find(s => s.id === activeServerId);

  // Auto scroll
  useEffect(() => {
    if (!isPaused && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isPaused]);

  // Connect to SSE stream
  useEffect(() => {
    if (!activeServerId) return;

    setLogs([]);
    setError(null);

    const es = new EventSource(`/api/servers/${activeServerId}/console`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          setLogs(prev => {
            const newLogs = [...prev, data.text];
            if (newLogs.length > 1000) return newLogs.slice(newLogs.length - 1000);
            return newLogs;
          });
        }
      } catch (e) {
        console.error("Error parsing log:", e);
      }
    };

    es.onerror = (err) => {
      console.error("SSE Error:", err);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [activeServerId]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !activeServerId) return;

    const cmd = command;
    setCommand("");

    try {
      const res = await fetch(`/api/servers/${activeServerId}/console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send command");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      if (isAtBottom && isPaused) {
        setIsPaused(false);
      } else if (!isAtBottom && !isPaused) {
        setIsPaused(true);
      }
    }
  };

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
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-400 hover:text-white transition-all group"
            >
              <LayoutDashboard className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
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
              { label: "Server Console", icon: Terminal, href: "/dashboard/console", active: true },
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
                  <link.icon className={`w-4 h-4 ${link.active ? "text-accentPurple" : "text-slate-500 group-hover:text-white"} transition-colors`} />
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

      {/* Main Dashboard Area */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-borderDark bg-[#0a0c12]/80 backdrop-blur-md flex-shrink-0 z-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
                <Terminal className="w-6 h-6 text-accentPurple" />
                Server Console
              </h1>
              <p className="text-sm text-mutedText mt-1">Live output and command input for running servers.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <select
                value={activeServerId}
                onChange={(e) => setActiveServerId(e.target.value)}
                className="appearance-none bg-slate-900 border border-slate-700 text-white px-4 py-2 pr-10 rounded-lg text-sm font-semibold focus:outline-none focus:border-accentPurple focus:ring-1 focus:ring-accentPurple w-64"
              >
                <option value="" disabled>Select a server...</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.game})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {activeServer && (
              <span className={`text-xs px-2 py-1 rounded font-bold flex items-center gap-1.5 ${
                activeServer.status === "RUNNING" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                activeServer.status === "STARTING" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                "bg-slate-800 text-slate-400 border border-slate-700"
              }`}>
                {activeServer.status === "RUNNING" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
                {activeServer.status}
              </span>
            )}
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mx-6 mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-bold block">Error</span>
              <span>{error}</span>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="text-xs hover:underline text-mutedText hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Console Container */}
        <div className="flex-1 p-6 flex flex-col min-h-0">
          <div className="flex-1 glass-panel border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-2xl relative">
            
            {/* Console Toolbar */}
            <div className="h-10 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                </div>
                <span className="text-xs font-mono text-slate-500 ml-2">stdout</span>
              </div>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`text-xs px-2 py-1 rounded border flex items-center gap-1 font-bold transition-colors ${
                  isPaused 
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30" 
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white"
                }`}
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {isPaused ? "RESUME" : "PAUSE"}
              </button>
            </div>

            {/* Logs Area */}
            <div 
              className="flex-1 overflow-y-auto p-4 font-mono text-sm text-slate-300 bg-[#0c0e14]"
              ref={containerRef}
              onScroll={handleScroll}
            >
              {logs.length === 0 ? (
                <div className="text-slate-600 italic">Waiting for server output...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">
                    {log}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>

            {/* Command Input Area */}
            <div className="p-3 border-t border-slate-800 bg-slate-900">
              <form onSubmit={handleSendCommand} className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-500 font-bold">{">"}</span>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder={activeServer?.status !== "RUNNING" ? "Server must be running to send commands..." : "Enter console command..."}
                    disabled={activeServer?.status !== "RUNNING"}
                    className="w-full bg-[#0c0e14] border border-slate-700 text-white pl-8 pr-4 py-2.5 rounded-lg text-sm font-mono focus:outline-none focus:border-accentPurple focus:ring-1 focus:ring-accentPurple disabled:opacity-50 disabled:cursor-not-allowed"
                    autoComplete="off"
                    spellCheck="false"
                  />
                </div>
                <button
                  type="submit"
                  disabled={activeServer?.status !== "RUNNING" || !command.trim()}
                  className="bg-accentPurple hover:bg-accentPurpleHover disabled:bg-slate-800 disabled:text-slate-500 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
            
          </div>
        </div>

      </main>
    </div>
  );
}
