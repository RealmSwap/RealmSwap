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
  X
} from "lucide-react";
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
  if (!server) return <div className="w-80 shrink-0"></div>;

  const [telemetry, setTelemetry] = React.useState<any[]>([]);
  const [crashOpen, setCrashOpen] = React.useState(false);
  const [crashData, setCrashData] = React.useState<{ crashes: any[]; weekCount: number } | null>(null);

  // Loads on mount (for the badge) and again on every open (for freshness)
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/servers/${server.id}/crashes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && data && setCrashData(data))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [crashOpen, server.id]);

  React.useEffect(() => {
    async function fetchTelemetry() {
      try {
        const res = await fetch(`/api/servers/${server.id}/telemetry`);
        if (res.ok) {
          const data = await res.json();
          // Format the created dates for the chart X-axis
          const formatted = data.map((d: any) => ({
            ...d,
            time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(d.createdAt))
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
  }, [server.id]);

  const isHealthy = server.healthStatus !== "DEGRADED" && server.status !== "CRASHED";
  
  // Format last backup date if it exists
  const lastBackupStr = server.lastSnapshotAt 
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(server.lastSnapshotAt))
    : "No backups yet";

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
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Wifi className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">Network</div>
              <div className="text-xs text-slate-400">No routing issues</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-accentPurple/10 text-accentPurple">
              <Save className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">Last Backup</div>
              <div className="text-xs text-slate-400">{lastBackupStr}</div>
            </div>
          </div>

          {/* Telemetry Chart */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <h4 className="text-xs font-bold text-slate-400 mb-2">Live Performance</h4>
            <div className="h-32 w-full">
              {telemetry.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetry} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
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
