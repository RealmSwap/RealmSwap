"use client";

import React from "react";
import { useActiveServer } from "./ActiveServerProvider";
import { gameIcon, gameLabel } from "@/lib/gameDisplay";

/**
 * The one shared "target server" selector bar. Every feature page renders this
 * instead of its own copy-pasted dropdown, so the choice follows the user
 * across pages (backed by ActiveServerProvider).
 */
export function ServerTargetBar({
  label = "Target Server",
  helper = "Select which server you're working with. Your choice follows you across pages.",
  className = "",
}: {
  label?: string;
  helper?: string;
  className?: string;
}) {
  const { servers, loading, activeServerId, setActiveServerId } = useActiveServer();

  return (
    <div className={`glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 ${className}`}>
      <div>
        <span className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-1">{label}</span>
        <span className="text-[11px] text-mutedText">{helper}</span>
      </div>

      <div className="min-w-[220px]">
        {loading ? (
          <span className="text-xs text-mutedText font-bold">Loading servers…</span>
        ) : servers.length === 0 ? (
          <span className="text-xs text-red-400 font-bold">No servers deployed yet</span>
        ) : (
          <select
            value={activeServerId || ""}
            onChange={(e) => setActiveServerId(e.target.value)}
            aria-label={label}
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
          >
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {gameIcon(s.game)} {s.name} — {gameLabel(s.game)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
