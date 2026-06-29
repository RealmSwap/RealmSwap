"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Download, Play, ShieldAlert, Package, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

interface SyncClientViewProps {
  link: string;
  host: string;
  inviteCode: string;
  manifest: any | null;
  error: string | null;
}

export default function SyncClientView({ link, host, inviteCode, manifest, error }: SyncClientViewProps) {
  const { addToast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [gamePath, setGamePath] = useState("");

  const handleSyncAndPlay = async () => {
    if (!manifest) return;
    setSyncing(true);
    setSyncStatus("Initializing sync...");
    setProgress(0);

    try {
      const res = await fetch("/api/client/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, inviteCode, manifest, gamePath })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start sync");
      
      // Setup SSE for progress
      const es = new EventSource(`/api/client/sync/progress?taskId=${data.taskId}`);
      
      es.addEventListener("message", (e) => {
        try {
          const payload = JSON.parse(e.data);
          setSyncStatus(payload.status);
          setProgress(payload.percent);
          
          if (payload.done) {
            es.close();
            setSyncing(false);
            setSyncStatus("Sync Complete! Launching game...");
            addToast("success", "Synchronization complete! Launching...");
          }
          if (payload.error) {
            es.close();
            setSyncing(false);
            setSyncStatus(null);
            addToast("error", payload.error);
          }
        } catch(err) {}
      });
      
      es.addEventListener("error", () => {
        es.close();
        if (syncing) {
          setSyncing(false);
          addToast("error", "Lost connection to sync engine.");
        }
      });
      
    } catch (err: any) {
      setSyncing(false);
      setSyncStatus(null);
      addToast("error", err.message);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-slate-100 px-4 py-12">
        <div className="glass-panel-purple p-8 rounded-2xl max-w-md w-full border border-red-500/20 text-center">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Connection Failed</h1>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" /> Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!manifest) return null;

  return (
    <div className="min-h-screen bg-background text-slate-100 p-8 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        
        <div className="glass-panel-purple rounded-2xl border border-accentPurple/20 overflow-hidden box-glow-purple">
          {/* Header */}
          <div className="p-8 border-b border-white/5 bg-slate-950/40 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accentPurple/20 border border-accentPurple/30 text-accentPurple mb-4 shadow-[0_0_20px_rgba(167,139,250,0.2)]">
              <Package className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">{manifest.serverName}</h1>
            <p className="text-slate-400 text-sm flex items-center justify-center gap-2">
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-medium">{manifest.game}</span>
              <span>•</span>
              <span className="font-mono text-xs opacity-75">{manifest.address}</span>
            </p>
          </div>

          <div className="p-8 space-y-8">
            
            {/* Required Mods */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Required Modpack</h3>
                <span className="text-xs font-bold px-2 py-1 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
                  {manifest.mods?.length || 0} Mods
                </span>
              </div>
              
              <div className="bg-slate-950/50 border border-white/5 rounded-xl max-h-64 overflow-y-auto">
                {(!manifest.mods || manifest.mods.length === 0) ? (
                  <div className="p-6 text-center text-slate-500 text-sm">No mods required for this server.</div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {manifest.mods.map((mod: any, idx: number) => (
                      <li key={idx} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <div>
                            <div className="text-sm font-bold text-slate-200">{mod.name || mod.packageId}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{mod.provider}</div>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-slate-400 bg-black/20 px-1.5 py-0.5 rounded">v{mod.version}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Path override (optional) */}
            <div>
               <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Game Directory (Optional)</h3>
               <p className="text-xs text-slate-500 mb-2">We will attempt to automatically detect your game directory via Steam. If you use a custom path, enter it below.</p>
               <input 
                 type="text" 
                 placeholder="e.g. C:\Program Files (x86)\Steam\steamapps\common\Valheim" 
                 value={gamePath}
                 onChange={(e) => setGamePath(e.target.value)}
                 className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accentPurple/50"
                 disabled={syncing}
               />
            </div>

            {/* Sync Status / Progress */}
            {syncing && (
              <div className="bg-slate-900 rounded-xl p-4 border border-white/10 shadow-inner">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-accentPurple flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {syncStatus || "Syncing..."}
                  </span>
                  <span className="font-mono text-xs text-slate-400">{progress !== null ? `${progress}%` : ''}</span>
                </div>
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-accentPurple to-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress || 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action */}
            <div className="pt-4 flex justify-end">
              <button
                onClick={handleSyncAndPlay}
                disabled={syncing}
                className="group relative flex items-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                <Play className="w-5 h-5 fill-current relative z-10" />
                <span className="relative z-10">Sync & Play</span>
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
