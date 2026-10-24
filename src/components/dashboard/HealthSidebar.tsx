"use client";

import React from "react";
import Link from "next/link";
import {
  Activity,
  Wifi,
  Save,
  PlusCircle,
  Terminal,
  Settings,
  Share2,
  BadgeCent,
  AlertTriangle,
  X,
  CalendarClock
} from "lucide-react";
import { formatSessionStart, PlannedSessionSummary } from "@/lib/sessions";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export function HealthSidebar({
  server
}: {
  server: any
}) {
  const [telemetry, setTelemetry] = React.useState<any[]>([]);
  const [sessions, setSessions] = React.useState<PlannedSessionSummary[] | null>(null);
  const [crashOpen, setCrashOpen] = React.useState(false);
  const [crashData, setCrashData] = React.useState<{ crashes: any[]; weekCount: number } | null>(null);
  const [latestBackup, setLatestBackup] = React.useState<any | null>(null);
  const [network, setNetwork] = React.useState<{ overall: "ready" | "maybe" | "blocked"; issue: { label: string; detail: string } | null; tunnelAlive: boolean } | null>(null);

  // Latest backup row (desc by createdAt) — feeds the Last Backup card and
  // its verification status.
  React.useEffect(() => {
    let cancelled = false;
    setLatestBackup(null);
    fetch(`/api/servers/${server?.id}/backups`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setLatestBackup(data[0] ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [server?.id]);

  // Loads on mount (for the badge) and again on every open (for freshness)
  React.useEffect(() => {
    if (!server) return;
    let cancelled = false;
    fetch(`/api/servers/${server.id}/crashes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && data && setCrashData(data))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [crashOpen, server?.id]);

  React.useEffect(() => {
    if (!server) return;
    async function fetchTelemetry() {
      try {
        const res = await fetch(`/api/servers/${server.id}/telemetry`);
        if (res.ok) {
          const data = await res.json();
          // Format the created dates for the chart X-axis (minute resolution —
          // the window is the last hour, so seconds are noise)
          const formatted = data.map((d: any) => ({
            ...d,
            time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(d.createdAt))
          }));
          setTelemetry(formatted);
        }
      } catch (err) {
        console.error("Failed to fetch telemetry:", err);
      }
    }

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 10000);
    return () => clearInterval(interval);
  }, [server?.id]);

  // Planned sessions come from the Discord bot's /plan command. Rosters change
  // when people click "I'm In" on Discord, so poll gently for freshness.
  React.useEffect(() => {
    if (!server) return;
    let cancelled = false;
    async function fetchSessions() {
      try {
        const res = await fetch(`/api/servers/${server.id}/sessions`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setSessions(data.sessions ?? []);
        }
      } catch {
        // Leave the previous state — transient fetch errors shouldn't blank the panel.
      }
    }
    fetchSessions();
    const interval = setInterval(fetchSessions, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [server?.id]);

  // Network truth (#110 connectivity checks + live tunnel liveness). Re-checked
  // on a gentle poll — router state and the playit agent can change at any time.
  React.useEffect(() => {
    if (!server) return;
    let cancelled = false;
    async function fetchNetwork() {
      try {
        const res = await fetch(`/api/servers/${server.id}/network-status`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.available !== false) {
            setNetwork({ overall: data.overall, issue: data.issue, tunnelAlive: data.tunnelAlive });
          }
        }
      } catch {
        // Leave the previous verdict — transient errors shouldn't blank the row.
      }
    }
    fetchNetwork();
    const interval = setInterval(fetchNetwork, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [server?.id]);

  if (!server) return <div className="w-80 shrink-0"></div>;

  const isHealthy = server.healthStatus !== "DEGRADED" && server.status !== "CRASHED";

  // Network row: real verdict from the connectivity checks. A stopped server
  // isn't "blocked" — it's just off, so say that instead of alarming.
  const networkView = (() => {
    if (!network) return { iconCls: "bg-blue-500/10 text-blue-400", cls: "text-slate-400", text: "Checking…" };
    if (server.status !== "RUNNING") return { iconCls: "bg-slate-800/60 text-slate-500", cls: "text-slate-500", text: "Offline — start to accept players" };
    if (network.overall === "ready") return { iconCls: "bg-emerald-500/10 text-emerald-400", cls: "text-emerald-400", text: "Ready for players" };
    if (network.overall === "maybe") return { iconCls: "bg-amber-500/10 text-amber-400", cls: "text-amber-400", text: "May be hard to join" };
    return { iconCls: "bg-red-500/10 text-red-400", cls: "text-red-400", text: "Players can't join" };
  })();
  const networkTitle = network?.issue?.detail
    ?? (network?.overall === "ready" ? "Server is running and reachable — no issues found." : undefined);
  
  // Format last backup date if it exists (prefer the newest Backup row;
  // fall back to server.lastSnapshotAt while the list is loading)
  const backupDate = latestBackup?.createdAt ?? server.lastSnapshotAt;
  const lastBackupStr = backupDate
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(backupDate))
    : "No backups yet";

  const relAge = (d: string | Date) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  const verify = latestBackup
    ? latestBackup.verifyError
      ? { text: "Verify failed", detail: latestBackup.verifyError, cls: "text-amber-400" }
      : latestBackup.verifiedAt
        ? { text: `Verified ${relAge(latestBackup.verifiedAt)}`, detail: "Archive opened and entries decompressed", cls: "text-emerald-400" }
        : { text: "Not verified yet", detail: "Run Verify from the Backups page", cls: "text-slate-500" }
    : null;

  return (
    <div className="w-80 shrink-0 flex flex-col gap-6">
      
      {/* Server Health Panel */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-xl overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-slate-950/40">
          <h3 className="text-sm font-extrabold text-white tracking-wide">Server Health</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">For {server.name}</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl ${isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">Performance</div>
              <div className="text-xs text-slate-400">{isHealthy ? 'Everything looks good' : 'Issues detected'}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl ${networkView.iconCls}`}>
              <Wifi className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">Network</div>
              <div className={`text-xs ${networkView.cls}`} title={networkTitle}>{networkView.text}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl ${verify?.cls === "text-amber-400" ? "bg-amber-500/10 text-amber-400" : verify?.cls === "text-emerald-400" ? "bg-emerald-500/10 text-emerald-400" : "bg-accentPurple/10 text-accentPurple"}`}>
              <Save className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">Last Backup</div>
              <div className="text-xs text-slate-400">{lastBackupStr}</div>
              {verify && (
                <div className={`text-[10px] font-bold mt-0.5 ${verify.cls}`} title={verify.detail}>
                  {verify.text}
                </div>
              )}
            </div>
          </div>

          {/* Telemetry Chart */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <h4 className="text-xs font-bold text-slate-400 mb-2">
              Live Performance <span className="font-medium text-slate-600">· last hour</span>
            </h4>
            <div className="h-32 w-full">
              {telemetry.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetry} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={48} />
                    <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#ffffff10', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="cpu" stroke="#a78bfa" strokeWidth={2} dot={false} name="CPU %" />
                    <Line yAxisId="right" type="monotone" dataKey="ramMB" stroke="#38bdf8" strokeWidth={2} dot={false} name="RAM (MB)" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 bg-black/20 rounded-xl border border-white/5">
                  Awaiting Telemetry...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Planned Sessions (Discord /plan) */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-xl overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-slate-950/40">
          <h3 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-400" />
            Planned Sessions
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Scheduled with /plan in Discord</p>
        </div>
        <div className="p-2">
          {sessions === null ? (
            <div className="px-3 py-4 text-xs text-slate-500 text-center">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-500 text-center leading-relaxed">
              No sessions planned. Run <span className="font-mono text-slate-400">/plan</span> in your
              Discord server and they'll show up here.
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">{s.title}</div>
                    <div className="text-[10px] text-slate-500">{formatSessionStart(s.startTime)}</div>
                  </div>
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex-shrink-0"
                    title={`${s.rosterCount} player${s.rosterCount === 1 ? "" : "s"} clicked I'm In on Discord`}
                  >
                    {s.rosterCount} in
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions Widget */}
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-xl overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-slate-950/40">
          <h3 className="text-sm font-extrabold text-white tracking-wide">Quick Actions</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">For {server.name}</p>
        </div>
        <div className="p-2 grid grid-cols-2 gap-2">
          <Link href={`/dashboard/backups?server=${server.id}`} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 transition-colors text-slate-400 hover:text-white">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-[10px] font-bold">Backup</span>
          </Link>
          <Link href={`/dashboard/console?server=${server.id}`} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 transition-colors text-slate-400 hover:text-white text-center">
            <Terminal className="w-5 h-5 text-sky-400" />
            <span className="text-[10px] font-bold">Console</span>
          </Link>
          <Link href={`/dashboard/config?server=${server.id}`} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 transition-colors text-slate-400 hover:text-white text-center">
            <Settings className="w-5 h-5 text-amber-400" />
            <span className="text-[10px] font-bold">Settings</span>
          </Link>
          <button
            onClick={() => setCrashOpen(true)}
            className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/5 transition-colors text-slate-400 hover:text-white text-center"
          >
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-[10px] font-bold">Crashes</span>
            {crashData && crashData.weekCount > 0 && (
              <span className="absolute top-1.5 right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500/80 text-white text-[9px] font-black flex items-center justify-center">
                {crashData.weekCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Crash History Modal */}
      {crashOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto"
          onClick={() => setCrashOpen(false)}
        >
          <div
            className="bg-[#030712] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Crash History — {server.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {crashData
                    ? crashData.weekCount > 0
                      ? `${crashData.weekCount} crash${crashData.weekCount === 1 ? "" : "es"} in the last 7 days`
                      : "No crashes in the last 7 days"
                    : "Loading…"}
                </p>
              </div>
              <button onClick={() => setCrashOpen(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {!crashData ? (
                <div className="text-center text-sm text-slate-500 py-8">Loading crash history…</div>
              ) : crashData.crashes.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-8">
                  This server has never crashed. 🎉
                </div>
              ) : (
                <ul className="space-y-2">
                  {crashData.crashes.map((c: any) => {
                    let meta: any = null;
                    try { meta = c.metadata ? JSON.parse(c.metadata) : null; } catch { /* legacy rows */ }
                    return (
                      <li key={c.id} className="p-3 rounded-xl bg-slate-950/50 border border-white/5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {meta?.exitCode !== undefined && (
                              <span className="text-[10px] font-black font-mono px-2 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-400 flex-shrink-0">
                                exit {meta.exitCode}{meta.signal ? ` · ${meta.signal}` : ""}
                              </span>
                            )}
                            <span className="text-xs text-slate-300 truncate">{c.details}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 flex-shrink-0">
                            {new Date(c.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">
                Full output lives in the server console and its log archives.
              </span>
              <Link
                href={`/dashboard/console?server=${server.id}`}
                onClick={() => setCrashOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-colors"
              >
                Open Console
              </Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
