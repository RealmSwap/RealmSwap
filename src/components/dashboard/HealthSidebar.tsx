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

export function HealthSidebar({ 
  server 
}: { 
  server: any
}) {
  if (!server) return <div className="w-80 shrink-0"></div>;

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
