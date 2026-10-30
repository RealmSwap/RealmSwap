"use client";

import React, { useState } from "react";
import { Archive, Plus, Trash2 } from "lucide-react";
import { gameIcon as getGameIcon, gameLabel, statusLabel } from "@/lib/gameDisplay";

export function VaultSection({ 
  archives, 
  servers = [],
  actions, 
  actionLoading 
}: { 
  archives: any[],
  servers?: any[],
  actions: any,
  actionLoading: string | null
}) {
  // Inline "pick a server to archive" chooser, opened from the empty state.
  const [choosing, setChoosing] = useState(false);
  const [pickId, setPickId] = useState("");

  const openChooser = () => {
    setChoosing(true);
    setPickId(servers[0]?.id ?? "");
  };

  if (archives.length === 0) {
    return (
      <section className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-xl overflow-hidden h-full flex flex-col">
        <div className="p-4 border-b border-white/5 bg-slate-950/40 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
            <Archive className="w-4 h-4 text-accentPurple" />
            <span>Archived Worlds</span>
          </h2>
        </div>
        <div className="px-12 pt-8 pb-24 flex flex-col items-center justify-center text-center flex-1 overflow-y-auto custom-scrollbar">
          <div className="mb-6 relative group flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-accentPurple/20 animate-ping opacity-10 blur-xl"></div>
            <img 
              src="/vault-empty.png" 
              alt="No archived worlds" 
              className="w-32 h-auto group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-300 relative z-10" 
            />
          </div>
          <h3 className="text-xl font-extrabold text-white mb-2">Nothing archived yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Archiving stores a server away safely and frees its disk space — restore it instantly whenever your group picks the game back up.
          </p>

          {!choosing ? (
            <button
              onClick={openChooser}
              disabled={servers.length === 0}
              title={servers.length === 0 ? "Deploy a server first — you can archive it once it exists" : undefined}
              className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 transition-all shadow-lg shadow-black/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Archive a Server
            </button>
          ) : servers.length === 0 ? (
            <p className="text-xs text-slate-400 font-bold">Deploy a server first — you can archive it once it exists.</p>
          ) : (
            <div className="w-full max-w-sm glass-panel rounded-xl border border-white/10 p-4 space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-left">
                Pick the server to archive
              </label>
              <select
                value={pickId}
                onChange={(e) => setPickId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getGameIcon(s.game)} {s.name} — {gameLabel(s.game)} ({statusLabel(s.status)})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 text-left leading-normal">
                The server stops and leaves your dashboard; its worlds are kept here. Restoring brings everything back.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setChoosing(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!pickId) return;
                    setChoosing(false);
                    actions.handleArchiveServer(pickId);
                  }}
                  disabled={!!actionLoading || !pickId}
                  className="px-4 py-1.5 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:opacity-50 text-white font-bold text-xs transition-colors shadow-lg shadow-accentPurple/20"
                >
                  Archive Server
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-xl overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-white/5 bg-slate-950/40 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
          <Archive className="w-4 h-4 text-accentPurple" />
          <span>Archived Worlds</span>
        </h2>
        <div className="text-xs font-bold text-slate-400 bg-slate-900/50 px-3 py-1 rounded-full border border-white/5">
          {archives.length} archived
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider sticky top-0 backdrop-blur-md">
              <th className="p-4 font-bold">Game</th>
              <th className="p-4 font-bold">World Name</th>
              <th className="p-4 font-bold text-center">Save Footprint</th>
              <th className="p-4 font-bold">Date Archived</th>
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
