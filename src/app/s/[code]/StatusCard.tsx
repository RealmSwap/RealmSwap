"use client";

import React from "react";
import { CalendarClock, Users } from "lucide-react";
import { formatSessionStart, formatBusiestHour } from "@/lib/sessions";
import { gameIcon, statusLabel } from "@/lib/gameDisplay";
import type { PublicServerStatus, PlayerHistoryPoint } from "@/lib/statusShare";

/**
 * "Players over the last 24h" bar strip — the busiest-hours story at a
 * glance (when friends actually show up). Counts only; hand-rolled bars
 * like the dashboard sparklines, no chart library.
 */
function PlayerHistoryStrip({ history }: { history: PlayerHistoryPoint[] }) {
  const peak = Math.max(...history.map((p) => p.n));
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(new Date(iso));
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span>Players · last 24h</span>
        <span className="text-emerald-400/80 normal-case">
          {peak > 0 ? `peak ${peak}` : ""}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-[2px] h-10" aria-label="Players over the last 24 hours">
        {history.map((p) => (
          <div
            key={p.t}
            className={`flex-1 rounded-sm min-w-[3px] ${p.n > 0 ? "bg-emerald-500/60" : "bg-slate-700/60"}`}
            style={{ height: `${peak > 0 ? Math.max((p.n / peak) * 100, 8) : 8}%` }}
            title={`${fmtTime(p.t)} — ${p.n} player${p.n === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>24h ago</span>
        <span>now</span>
      </div>
    </div>
  );
}

const HEATMAP_DOW = new Intl.DateTimeFormat("en-US", { weekday: "narrow" });
const HEATMAP_HOUR = new Intl.DateTimeFormat("en-US", { hour: "numeric" });

/**
 * The full "Fridays 8–11 PM" story: average players per weekday×hour over
 * the last week, host-local time. Cells scale against the week's busiest
 * hour; only rendered once there's real data.
 */
function WeeklyHeatmap({ weekly }: { weekly: number[][] }) {
  const max = Math.max(...weekly.flat());
  if (max <= 0) return null;
  let busiest = { dow: 0, hour: 0 };
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      if (weekly[dow][hour] > weekly[busiest.dow][busiest.hour]) busiest = { dow, hour };
    }
  }
  const cellColor = (v: number) => {
    const r = v / max;
    if (r > 0.66) return "bg-emerald-400";
    if (r > 0.33) return "bg-emerald-500/70";
    return "bg-emerald-600/40";
  };
  // Jan 4 2026 is a Sunday — construct dates from it so dow/hour stay fixed
  // regardless of the viewer's timezone.
  const date = (dow: number, hour: number) => new Date(2026, 0, 4 + dow, hour);
  const fmtDow = (dow: number) => new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date(dow, 0));
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span>Busiest hours · last 7 days</span>
      </div>
      <div className="mt-2 space-y-[3px]" aria-label="Average players by weekday and hour over the last week">
        {weekly.map((day, dow) => (
          <div key={dow} className="grid grid-cols-[10px_1fr] items-center gap-1.5">
            <span className="text-[9px] font-bold text-slate-600 text-center">{HEATMAP_DOW.format(date(dow, 0))}</span>
            <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
              {day.map((v, hour) => (
                <div
                  key={hour}
                  className={`h-2 rounded-[2px] ${v > 0 ? cellColor(v) : "bg-slate-800/70"}`}
                  title={`${fmtDow(dow)} ${HEATMAP_HOUR.format(date(dow, hour))} — avg ${v} player${v === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-600">
        <span>12 AM</span>
        <span className="text-slate-500">Busiest: {formatBusiestHour(busiest)}</span>
        <span>11 PM</span>
      </div>
      <p className="mt-1 text-[10px] text-slate-600">Average players by hour · host&apos;s local time</p>
    </div>
  );
}

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

        {status.history.length > 0 && <PlayerHistoryStrip history={status.history} />}

        {status.weekly?.some((day) => day.some((v) => v > 0)) && <WeeklyHeatmap weekly={status.weekly} />}

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
