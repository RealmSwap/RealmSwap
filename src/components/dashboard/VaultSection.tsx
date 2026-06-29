"use client";

import React from "react";
import { Archive, Plus, Trash2, Box } from "lucide-react";

export function VaultSection({ 
  archives, 
  actions, 
  actionLoading 
}: { 
  archives: any[],
  actions: any,
  actionLoading: string | null
}) {
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

  if (archives.length === 0) {
    return (
      <section className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-xl overflow-hidden h-full flex flex-col">
        <div className="p-4 border-b border-white/5 bg-slate-950/40 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
            <Archive className="w-4 h-4 text-accentPurple" />
            <span>Game History Vault</span>
          </h2>
        </div>
        <div className="p-12 flex flex-col items-center justify-center text-center flex-1">
          <div className="w-20 h-20 rounded-full bg-accentPurple/10 flex items-center justify-center mb-6 relative group">
            <div className="absolute inset-0 rounded-full bg-accentPurple/20 animate-ping opacity-20"></div>
            <Box className="w-10 h-10 text-accentPurple group-hover:scale-110 transition-transform duration-300" />
          </div>
          <h3 className="text-xl font-extrabold text-white mb-2">Vault is empty</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Archive your servers to safely store their world data while freeing up system resources. You can restore them instantly at any time.
          </p>
          <button className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 transition-all shadow-lg shadow-black/20">
            Archive a Server
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-xl overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-white/5 bg-slate-950/40 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
          <Archive className="w-4 h-4 text-accentPurple" />
          <span>Game History Vault</span>
        </h2>
        <div className="text-xs font-bold text-slate-400 bg-slate-900/50 px-3 py-1 rounded-full border border-white/5">
          {archives.length} items
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider sticky top-0 backdrop-blur-md">
              <th className="p-4 font-bold">Game</th>
              <th className="p-4 font-bold">World Name</th>
              <th className="p-4 font-bold text-center">Save Footprint</th>
              <th className="p-4 font-bold">Date Vaulted</th>
              <th className="p-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {archives.map((archive) => {
              const isArchiveLoading = actionLoading?.split("-")[0] === archive.id;
              return (
                <tr key={archive.id} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getGameIcon(archive.game)}</span>
                      <span className="font-bold text-xs bg-slate-950 px-2 py-0.5 rounded border border-white/5 text-slate-300">{archive.game}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-slate-200 group-hover:text-accentPurple transition-colors">{archive.serverName}</span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="font-mono text-xs text-slate-300 bg-slate-950 px-2 py-1 rounded-lg border border-white/5">{archive.saveSizeGB} {archive.saveSizeGB < 1 ? "MB" : "GB"}</span>
                  </td>
                  <td className="p-4 text-xs font-medium text-slate-500">
                    {new Date(archive.archivedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => actions.handleRestoreArchive(archive.id)}
                        disabled={isArchiveLoading}
                        className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </button>
                      <button
                        onClick={() => actions.handleDeleteArchive(archive.id)}
                        disabled={isArchiveLoading}
                        className="p-2 rounded-lg bg-slate-900 border border-white/5 hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
