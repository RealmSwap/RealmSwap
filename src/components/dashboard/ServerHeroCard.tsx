"use client";

import React from "react";
import Link from "next/link";
import { Sparkline } from "./Sparkline";
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
  BadgeCent
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

  // Game thumbnail gradients
  const getThumbnailStyle = (game: string) => {
    switch(game) {
      case "MINECRAFT": return "from-green-600/80 to-emerald-900/80";
      case "VALHEIM": return "from-blue-600/80 to-slate-900/80";
      case "ENSHROUDED": return "from-orange-600/80 to-red-900/80";
      case "ZOMBOID": return "from-stone-600/80 to-neutral-900/80";
      case "ARK": return "from-emerald-700/80 to-teal-900/80";
      case "RUST": return "from-red-700/80 to-orange-900/80";
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
      default: return "🎮";
    }
  };

  return (
    <div 
      className={`bg-slate-900/40 backdrop-blur-xl border ${isSelected ? 'border-accentPurple shadow-[0_0_20px_rgba(167,139,250,0.3)] ring-1 ring-accentPurple' : 'border-white/5 hover:border-accentPurple/30'} rounded-[18px] shadow-xl overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-accentPurple/10 flex flex-col group cursor-pointer`}
      onClick={onSelect}
    >
      {/* Thumbnail Header */}
      <div 
        className={`h-32 relative p-4 flex flex-col justify-between overflow-hidden`}
      >
        <div className="absolute inset-0 bg-slate-950 z-0" />
        <div 
          className="absolute inset-0 bg-cover bg-center z-0 opacity-75" 
          style={{ backgroundImage: `url('${getGameArt(server.game)}')` }}
        />
        <div className={`absolute inset-0 bg-gradient-to-br ${getThumbnailStyle(server.game)} z-0 opacity-40 mix-blend-color`} />
        <div className={`absolute inset-0 bg-gradient-to-br ${getThumbnailStyle(server.game)} z-0 opacity-30`} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent z-0" />
        
        <div className="relative z-10 flex justify-between items-start">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
            <span className="text-sm">{getGameIcon(server.game)}</span>
            <span className="text-xs font-bold text-white tracking-wide">{server.game}</span>
          </div>
          
          <div className={`px-2.5 py-1 rounded-lg border backdrop-blur-md text-xs font-bold shadow-lg flex items-center gap-1.5
            ${server.status === "RUNNING" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" :
              server.status === "STARTING" || server.status === "UPDATING" ? "bg-amber-500/20 border-amber-500/40 text-amber-400" :
              server.status === "CRASHED" ? "bg-red-500/20 border-red-500/40 text-red-400" :
              "bg-slate-800/80 border-slate-600 text-slate-300"}`}
          >
            {isRunning && <span className={`w-1.5 h-1.5 rounded-full ${server.status === "RUNNING" ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-pulse"}`} />}
            {server.status}
          </div>
        </div>
        
        <div className="relative z-10">
          <h2 className="text-2xl font-extrabold text-white drop-shadow-md truncate">{server.name}</h2>
          <div className="flex items-center gap-2 text-xs font-medium text-white/80 mt-1">
            <span className="bg-white/20 px-2 py-0.5 rounded text-white">{isLocal ? "Local Machine" : server.region}</span>
            {server.ipAddress && (
              <div 
                className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors group/ip"
                onClick={() => {
                  navigator.clipboard.writeText(`${server.ipAddress}:${server.port}`);
                  actions.setCopiedIp(`${server.ipAddress}:${server.port}`);
                }}
              >
                <span>{server.ipAddress}:{server.port}</span>
                {copiedIp === `${server.ipAddress}:${server.port}` ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 opacity-0 group-hover/ip:opacity-100 transition-opacity" />
                )}
              </div>
            )}
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
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400 font-medium flex items-center gap-1"><Save className="w-3 h-3"/> Disk</span>
            <span className="text-white font-bold">~1.2G</span>
          </div>
          <div className="h-1 w-full bg-slate-800 rounded-full mb-1 overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: "25%" }} />
          </div>
          <Sparkline data={[1.2, 1.2, 1.2, 1.2, 1.2]} color="#34d399" height={16} width={80} className="opacity-50" />
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
      </div>

      {/* Secondary Actions */}
      <div className="px-4 pb-4 pt-1 flex justify-between gap-2 border-t border-white/5 mt-auto bg-slate-950/20">
        <div className="flex gap-2 pt-3">
          <button
            onClick={(e) => { e.stopPropagation(); actions.handleArchiveServer(server.id); }}
            disabled={isServerLoading || server.status === "STARTING"}
            className="text-[10px] uppercase font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            <Archive className="w-3 h-3" /> Vault
          </button>
          {isLocal && (
            <button
              onClick={(e) => { e.stopPropagation(); actions.handleOpenServerFolder(server.id); }}
              disabled={isServerLoading || server.status === "STARTING"}
              className="text-[10px] uppercase font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <FolderOpen className="w-3 h-3" /> Files
            </button>
          )}
        </div>
        <div className="flex gap-2 pt-3">
          <a
            href={`/api/servers/${server.id}/export`}
            onClick={(e) => e.stopPropagation()}
            download
            className={`text-[10px] uppercase font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors ${isServerLoading || server.status === "STARTING" ? "opacity-50 pointer-events-none" : ""}`}
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
              className="text-[10px] uppercase font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <UploadCloud className="w-3 h-3" /> Import
            </button>
          )}
        </div>
      </div>

      {/* RealmSync Feature Card inline */}
      <div className="px-4 pb-4 pt-3 border-t border-white/5 bg-slate-950/50" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BadgeCent className="w-4 h-4 text-accentPurple" />
            <h3 className="font-extrabold text-white text-xs tracking-wide">RealmSync Link</h3>
          </div>
        </div>
        {server.inviteCode ? (
          <div className="bg-black/40 rounded-xl p-2 border border-white/5 flex flex-col gap-1.5 hover:border-accentPurple/30 transition-colors cursor-pointer group/link" onClick={() => navigator.clipboard.writeText(`realmsync://${server.inviteCode}`)}>
            <div className="font-mono text-[10px] text-slate-300 truncate select-all">realmsync://{server.inviteCode}</div>
            <div className="text-[9px] font-bold text-accentPurple opacity-0 group-hover/link:opacity-100 transition-opacity flex items-center justify-between">
              <span>Click to Copy Deep Link</span>
              <Copy className="w-3 h-3" />
            </div>
          </div>
        ) : (
          <button
            onClick={() => actions.handleGenerateInvite(server.id)}
            className="w-full py-1.5 bg-accentPurple hover:bg-accentPurple/90 text-white font-bold text-[10px] rounded-lg transition-all shadow-md shadow-accentPurple/20"
          >
            Generate Sync Link
          </button>
        )}
      </div>
    </div>
  );
}
