"use client";

import React from "react";
import { CalendarClock, Users } from "lucide-react";
import { formatSessionStart } from "@/lib/sessions";
import { gameIcon, statusLabel } from "@/lib/gameDisplay";
import type { PublicServerStatus } from "@/lib/statusShare";

/**
 * Live view of the public status payload. Server-rendered with the page's
 * initial data, then gently polls /api/s/<code> so the player count and next
 * session stay fresh without a reload.
 */
export function StatusCard({ initial }: { initial: PublicServerStatus | null }) {
  const [status, setStatus] = React.useState<PublicServerStatus | null>(initial);

  React.useEffect(() => {
    if (!initial) return; // nothing to poll — the link is off/unknown
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/s/${initial.code}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setStatus(data);
        } else if (res.status === 404 && !cancelled) {
          setStatus(null); // turned off since load
        }
      } catch {
        // transient — keep showing the last known truth
      }
    };
    const interval = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [initial?.code]);

  if (!status) {
    return (
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl p-8 text-center">
        <p className="text-sm font-bold text-slate-200">This status link is off or doesn&apos;t exist.</p>
        <p className="text-xs text-slate-500 mt-2">
          Ask the server host for a fresh link, or manage it from your RealmSwap dashboard.
        </p>
      </div>
    );
  }

  const up = status.status === "RUNNING";
  const starting = status.status === "STARTING" || status.status === "UPDATING";
  const crashed = status.status === "CRASHED";

  const pill = up
    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
    : starting
      ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
      : crashed
        ? "bg-red-500/15 border-red-500/40 text-red-400"
        : "bg-slate-800/80 border-white/10 text-slate-400";

  return (
    <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {gameIcon(status.game)} {status.game}
            </div>
            <h1 className="text-2xl font-extrabold text-white truncate mt-1">{status.name}</h1>
          </div>
          <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-extrabold ${pill}`}>
            {(up || starting) && <span className={`w-1.5 h-1.5 rounded-full ${up ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />}
            {up ? "Up" : statusLabel(status.status)}
          </span>
        </div>

        {up && status.players != null ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-slate-200">
            <Users className="w-4 h-4 text-sky-400" />
            <span className="font-bold">{status.players}</span>
            {status.maxplayers != null && <span className="text-slate-500">/ {status.maxplayers}</span>}
            <span className="text-slate-400">players online</span>
          </div>
        ) : up ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">
            <Users className="w-4 h-4 text-slate-600" />
            Up — this game doesn&apos;t report player counts
          </div>
        ) : null}

        {status.nextSession && (
          <div className="mt-5 p-3 rounded-xl bg-slate-950/50 border border-white/5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              <CalendarClock className="w-3.5 h-3.5" />
              Next session
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-200 truncate">{status.nextSession.title}</div>
                <div className="text-xs text-slate-500">{formatSessionStart(status.nextSession.startTime)}</div>
              </div>
              <span
                className="flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                title={`${status.nextSession.rosterCount} player${status.nextSession.rosterCount === 1 ? "" : "s"} clicked I'm In on Discord`}
              >
                {status.nextSession.rosterCount} in
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
