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
  BadgeCent 
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
        <div className="p-2 grid grid-cols-3 gap-2">
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
        </div>
      </div>

    </div>
  );
}
