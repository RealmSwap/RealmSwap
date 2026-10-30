"use client";

import React from "react";
import Link from "next/link";
import { Sparkline } from "./Sparkline";
import { statusLabel, gameLabel } from "@/lib/gameDisplay";
import { formatSessionStart } from "@/lib/sessions";
import { motion } from "framer-motion";
import {
  Play,
  Square,
  RefreshCw,
  Terminal,
  Save,
  Archive,
  FolderOpen,
  Package,
  UploadCloud,
  Check,
  Copy,
  Download,
  Activity,
  HardDrive,
  BadgeCent,
  Sparkles,
  RotateCw,
  MemoryStick,
  QrCode,
  CalendarClock,
  Users
} from "lucide-react";

export function ServerHeroCard({
  server,
  serverStats,
  progressMap,
  isServerLoading,
  copiedIp,
  isSelected,
  onSelect,
  actions
}: {
  server: any;
  serverStats: { cpu: number[]; memory: number[] };
  progressMap: any;
  isServerLoading: boolean;
  copiedIp: string | null;
  isSelected?: boolean;
  onSelect?: () => void;
  actions: any;
}) {
  const isRunning = server.status === "RUNNING" || server.status === "STARTING" || server.status === "UPDATING";
  const isLocal = server.runnerType === "LOCAL";

  // Real disk numbers for the Disk tile: server folder size + host free
  // space + recent size history (from the telemetry table's diskMB stamps).
  const [disk, setDisk] = React.useState<{ folderGB: number | null; freeGB: number | null; history: number[] } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/servers/${server.id}/disk`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data && !data.error) setDisk(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [server.id]);

  const diskText = disk === null ? "…" : disk.folderGB === null ? "—" : `${disk.folderGB.toFixed(1)}G`;
  const diskBarPct =
    disk?.folderGB != null && disk?.freeGB != null && disk.freeGB > 0
      ? Math.min((disk.folderGB / (disk.folderGB + disk.freeGB)) * 100, 100)
      : 0;
  const diskTitle =
    disk === null
      ? "Measuring…"
      : disk.folderGB === null
        ? "No local install folder found"
        : disk.freeGB != null
          ? `${disk.folderGB.toFixed(2)} GB on disk · ${disk.freeGB.toFixed(1)} GB free on this machine`
          : `${disk.folderGB.toFixed(2)} GB on disk`;

  // Game thumbnail gradients
  const getThumbnailStyle = (game: string) => {
    switch(game) {
      case "MINECRAFT": return "from-green-600/80 to-emerald-900/80";
      case "VALHEIM": return "from-blue-600/80 to-slate-900/80";
      case "ENSHROUDED": return "from-orange-600/80 to-red-900/80";
      case "ZOMBOID": return "from-stone-600/80 to-neutral-900/80";
      case "ARK": return "from-emerald-700/80 to-teal-900/80";
      case "RUST": return "from-red-700/80 to-orange-900/80";
      case "SATISFACTORY": return "from-orange-500/80 to-stone-900/80";
      case "VRISING": return "from-red-900/80 to-black/80";
      case "WINDROSE": return "from-sky-500/80 to-blue-900/80";
      default: return "from-purple-600/80 to-slate-900/80";
    }
  };

  const getGameArt = (game: string) => {
    switch(game) {
      case "MINECRAFT": return "/games/minecraft.jpg";
      case "VALHEIM": return "/games/valheim.jpg";
      case "ENSHROUDED": return "/games/enshrouded.jpg";
      case "ZOMBOID": return "/games/zomboid.jpg";
      case "ARK": return "/games/ark.jpg";
      case "TERRARIA": return "/games/terraria.jpg";
      case "PALWORLD": return "/games/palworld.jpg";
      case "RUST": return "/games/rust.jpg";
      case "SATISFACTORY": return "/games/satisfactory.jpg";
      case "VRISING": return "/games/vrising.jpg";
      case "WINDROSE": return "/games/windrose.jpg";
      default: return "/games/generic.jpg";
    }
  };

  const getGameIcon = (game: string) => {
    switch(game) {
      case "MINECRAFT": return "⛏️";
      case "VALHEIM": return "⛵";
      case "ENSHROUDED": return "🔥";
      case "ZOMBOID": return "🧟";
      case "ARK": return "🦖";
      case "TERRARIA": return "🌳";
      case "PALWORLD": return "🦊";
      case "RUST": return "⚙️";
      case "SATISFACTORY": return "🏭";
      case "VRISING": return "🦇";
      case "WINDROSE": return "⚔️";
      default: return "🎮";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Select server ${server.name}`}
      onClick={() => onSelect?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={`bg-slate-900/40 backdrop-blur-xl border ${isSelected ? 'border-accentPurple shadow-[0_0_20px_rgba(167,139,250,0.3)] ring-1 ring-accentPurple' : 'border-white/5 hover:border-accentPurple/30'} rounded-[18px] shadow-xl overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-accentPurple/10 flex flex-col group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accentPurple`}
    >
      {/* Thumbnail Header */}
      <div 
        className={`h-32 relative p-4 flex flex-col justify-between overflow-hidden`}
      >
        <div className="absolute inset-0 bg-slate-950 z-0" />
        
        {/* 100% visible game art */}
        <div 
          className="absolute inset-0 bg-cover bg-center z-0" 
          style={{ backgroundImage: `url('${getGameArt(server.game)}')` }}
        />
        
        {/* Very light theme tint */}
        <div className={`absolute inset-0 bg-gradient-to-br ${getThumbnailStyle(server.game)} z-0 opacity-30 mix-blend-overlay`} />
        
        {/* Only bottom text protection */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-0" />
        
        <div className="relative z-10 flex justify-between items-start">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
            <span className="text-xs font-bold text-white tracking-wide">{gameLabel(server.game)}</span>
          </div>
          
          <div className={`px-2.5 py-1 rounded-lg border backdrop-blur-md text-xs font-bold shadow-lg flex items-center gap-1.5
            ${server.status === "RUNNING" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" :
              server.status === "STARTING" || server.status === "UPDATING" ? "bg-amber-500/20 border-amber-500/40 text-amber-400" :
              server.status === "CRASHED" ? "bg-red-500/20 border-red-500/40 text-red-400" :
              "bg-slate-800/80 border-slate-600 text-slate-300"}`}
          >
            {isRunning && <span className={`w-1.5 h-1.5 rounded-full ${server.status === "RUNNING" ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-pulse"}`} />}
            {statusLabel(server.status)}
          </div>

          {server.pendingRestart && isRunning && (
            <div
              className="px-2.5 py-1 rounded-lg border backdrop-blur-md text-[10px] font-bold shadow-lg flex items-center gap-1.5 bg-sky-500/20 border-sky-500/40 text-sky-300"
              title="Settings were saved while the server was running — they take effect on the next start."
            >
              <RotateCw className="w-3 h-3" />
              RESTART PENDING
            </div>
          )}
        </div>
        
        <div className="relative z-10">
          <h2 className="text-2xl font-extrabold text-white drop-shadow-md truncate">{server.name}</h2>
          {server.plannedSessions?.length > 0 && (
            <div
              className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-300/90 mt-1 w-fit"
              title={`Planned in Discord: ${server.plannedSessions[0].title} — ${server.plannedSessions[0].rosterCount} in${server.plannedSessions.length > 1 ? ` (+${server.plannedSessions.length - 1} more scheduled)` : ""}. The server boots automatically ${server.autoStartLeadMinutes ?? 15} min before the session.${server.plannedSessions.length > 1 ? ` (+${server.plannedSessions.length - 1} more scheduled)` : ""}`}
            >
              <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate max-w-[320px]">
                {formatSessionStart(server.plannedSessions[0].startTime)} · {server.plannedSessions[0].rosterCount} in
                {" · "}
                auto-starts{" "}
                {formatSessionStart(
                  new Date(new Date(server.plannedSessions[0].startTime).getTime() - (server.autoStartLeadMinutes ?? 15) * 60_000).toISOString()
                )}
              </span>
            </div>
          )}
          {server.ramHint && (
            <div
              className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300/90 mt-1 w-fit"
              title="Based on the peak memory usage of the last 7 days"
            >
              <MemoryStick className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate max-w-[320px]">{server.ramHint}</span>
            </div>
          )}
          {server.playerHint && (
            <div
              className="flex items-center gap-1.5 text-[11px] font-medium text-violet-300/90 mt-1 w-fit"
              title="Based on player counts reported by the game over the last 7 days"
            >
              <Users className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate max-w-[320px]">{server.playerHint}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/80 mt-1">
            <span className="bg-white/20 px-2 py-0.5 rounded text-white">{isLocal ? "Local Machine" : server.region}</span>
            <button
              onClick={(e) => { e.stopPropagation(); actions.setConnectionServer(server); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-accentPurple/20 border border-accentPurple/40 text-accentPurple hover:bg-accentPurple hover:text-white hover:border-accentPurple text-[11px] font-bold transition-all shadow-sm"
              title="Invite friends or check why they can't join"
            >
              <QrCode className="w-3.5 h-3.5" />
              Join Info
            </button>
          </div>
        </div>
      </div>

      {/* Progress / Updating Bar */}
      {(server.status === "STARTING" || server.status === "UPDATING") && progressMap[server.id] && (
        <div className="bg-slate-950 px-4 py-2 border-b border-white/5">
          <div className="flex items-center justify-between text-[10px] text-accentPurple font-bold uppercase tracking-wider mb-1">
            <span>{progressMap[server.id]!.label}</span>
            <span>{progressMap[server.id]!.percent !== null ? `${Math.round(progressMap[server.id]!.percent!)}%` : ""}</span>
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

      {/* Resource Section */}
      <div className="p-4 grid grid-cols-3 gap-4 border-b border-white/5 bg-slate-900/20">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400 font-medium flex items-center gap-1"><Activity className="w-3 h-3"/> CPU</span>
            <span className="text-white font-bold">{server.cpuUsage}%</span>
          </div>
          <div className="h-1 w-full bg-slate-800 rounded-full mb-1 overflow-hidden">
            <div className="h-full bg-accentPurple rounded-full transition-all" style={{ width: `${Math.min(server.cpuUsage, 100)}%` }} />
          </div>
          <Sparkline data={serverStats?.cpu || []} color="#a78bfa" height={16} width={80} className="opacity-50" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400 font-medium flex items-center gap-1"><HardDrive className="w-3 h-3"/> RAM</span>
            <span className="text-white font-bold">{server.memoryUsage}G</span>
          </div>
          <div className="h-1 w-full bg-slate-800 rounded-full mb-1 overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${Math.min((server.memoryUsage / server.ramAllocation) * 100, 100)}%` }} />
          </div>
          <Sparkline data={serverStats?.memory || []} color="#60a5fa" height={16} width={80} className="opacity-50" />
        </div>
        <div title={diskTitle}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400 font-medium flex items-center gap-1"><Save className="w-3 h-3"/> Disk</span>
            <span className="text-white font-bold">{diskText}</span>
          </div>
          <div className="h-1 w-full bg-slate-800 rounded-full mb-1 overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${diskBarPct}%` }} />
          </div>
          <Sparkline data={disk?.history ?? []} color="#34d399" height={16} width={80} className="opacity-50" />
        </div>
      </div>

      {/* Primary Actions */}
      <div className="p-4 flex gap-2">
        <button
          onClick={() => actions.handlePowerAction(server.id, "start")}
          disabled={isRunning || isServerLoading}
          className="flex-1 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex justify-center items-center gap-1.5 transition-all disabled:opacity-30 disabled:hover:bg-emerald-500/10"
        >
          <Play className="w-3.5 h-3.5 fill-current" /> Start
        </button>
        <button
          onClick={() => actions.handlePowerAction(server.id, "stop")}
          disabled={(!isRunning && server.status !== "STARTING") || isServerLoading}
          className="flex-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-bold text-xs flex justify-center items-center gap-1.5 transition-all disabled:opacity-30 disabled:hover:bg-red-500/10"
        >
          <Square className="w-3.5 h-3.5 fill-current" /> Stop
        </button>
        <button
          onClick={() => actions.handlePowerAction(server.id, "restart")}
          disabled={!isRunning || isServerLoading}
          className="p-2 rounded-xl bg-slate-800 border border-white/5 hover:border-blue-500/40 text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-30"
          title="Restart"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <Link
          href={`/dashboard/console?server=${server.id}`}
          className="p-2 rounded-xl bg-slate-800 border border-white/5 hover:border-accentPurple/40 text-slate-400 hover:text-accentPurple transition-colors"
          title="Console"
        >
          <Terminal className="w-4 h-4" />
        </Link>
        <button
          onClick={(e) => { e.preventDefault(); actions.setAdvisorServer(server); }}
          disabled={isServerLoading || server.status === "STARTING"}
          className="p-2 rounded-xl bg-slate-800 border border-white/5 hover:border-sky-500/40 text-slate-400 hover:text-sky-400 transition-colors disabled:opacity-30"
          title="Push to Cloud"
        >
          <UploadCloud className="w-4 h-4" />
        </button>
      </div>

      {/* Secondary Actions */}
      <div className="px-4 pb-4 pt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t border-white/5 mt-auto bg-slate-950/20">
        <div className="flex gap-2 pt-3">
          <button
            onClick={(e) => { e.stopPropagation(); actions.handleArchiveServer(server.id); }}
            disabled={isServerLoading || server.status === "STARTING"}
            className="text-[10px] uppercase font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Archive className="w-3 h-3" /> Vault
          </button>
          {isLocal && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); actions.handleOpenServerFolder(server.id); }}
                disabled={isServerLoading || server.status === "STARTING"}
                className="text-[10px] uppercase font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <FolderOpen className="w-3 h-3" /> Files
              </button>
            </>
          )}
        </div>
        <div className="flex gap-2 pt-3">
          <a
            href={`/api/servers/${server.id}/export`}
            onClick={(e) => e.stopPropagation()}
            download
            className={`text-[10px] uppercase font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors whitespace-nowrap ${isServerLoading || server.status === "STARTING" ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Package className="w-3 h-3" /> Export
          </a>
          {!isRunning && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.setImportMapServer(server);
                actions.setImportWorldPath("");
                actions.setImportError(null);
                actions.setImportSuccess(null);
              }}
              disabled={isServerLoading || server.status === "STARTING"}
              className="text-[10px] uppercase font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <UploadCloud className="w-3 h-3" /> Import
            </button>
          )}
        </div>
      </div>

    </div>
    </motion.div>
  );
}
