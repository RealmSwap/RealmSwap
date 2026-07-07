"use client";

import { SidebarNavigation } from "./dashboard/SidebarNavigation";
import { ServerHeroCard } from "./dashboard/ServerHeroCard";
import { HealthSidebar } from "./dashboard/HealthSidebar";
import { ActivityFeed } from "./dashboard/ActivityFeed";
import { VaultSection } from "./dashboard/VaultSection";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useModal } from "@/components/ModalProvider";
import { useToast } from "@/components/ToastProvider";
import { CloudAdvisorModal } from "@/components/dashboard/advisor/CloudAdvisorModal";
import {
  Server as ServerIcon,
  Archive,
  Cpu,
  Database,
  Layers,
  RefreshCw,
  Play,
  Square,
  Plus,
  Copy,
  Check,
  X,
  Activity,
  Package,
  FolderOpen,
  UploadCloud
} from "lucide-react";

interface DashboardViewProps {
  initialData: {
    user: any;
    servers: any[];
    archives: any[];
    activityLogs: any[];
    slots: {
      used: number;
      total: number;
      remaining: number;
    };
  };
}



export default function DashboardView({ initialData }: DashboardViewProps) {
  const router = useRouter();
  const { showModal } = useModal();
  const { addToast } = useToast();
  const seenLogIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);
  const [data, setData] = useState(initialData);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // "server-id" or "archive-id"
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Import Map Modal State
  const [advisorServer, setAdvisorServer] = useState<any>(null);
  const [importMapServer, setImportMapServer] = useState<any>(null);
  const [importWorldPath, setImportWorldPath] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Stats history for sparklines
  const [serverStats, setServerStats] = useState<Record<string, { cpu: number[]; memory: number[] }>>({});

  // Selected server for Health Sidebar
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  // Initialize selected server on first load
  useEffect(() => {
    if (!selectedServerId && data.servers.length > 0) {
      setSelectedServerId(data.servers[0].id);
    }
  }, [data.servers, selectedServerId]);

  // Live install/download progress for STARTING/UPDATING servers
  const [progressMap, setProgressMap] = useState<
    Record<string, { phase: string; percent: number | null; label: string } | null>
  >({});

  // Poll database for updates (live stats fluctuation)
  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const res = await fetch("/api/servers", { cache: "no-store" });
        if (res.ok) {
          const updated = await res.json();
          setData(updated);
          
          if (updated.activityLogs) {
            updated.activityLogs.forEach((log: any) => {
              if (!initialLoadRef.current && log.action === "SYSTEM_ERROR" && !seenLogIdsRef.current.has(log.id)) {
                addToast("error", log.details);
              }
              seenLogIdsRef.current.add(log.id);
            });
          }
          initialLoadRef.current = false;
        }
      } catch (err) {
        console.error("Error polling server states:", err);
      }
    };

    fetchUpdates(); // Initial fetch
    const interval = setInterval(fetchUpdates, 60000); // Poll every 60s as a fallback
    return () => clearInterval(interval);
  }, [addToast]);

  const fetchedHistoryRef = useRef<Set<string>>(new Set());

  // Fetch initial history for running servers
  useEffect(() => {
    const running = data.servers.filter((s: any) => s.status === "RUNNING");
    running.forEach(async (server: any) => {
      if (!fetchedHistoryRef.current.has(server.id)) {
        fetchedHistoryRef.current.add(server.id);
        try {
          const res = await fetch(`/api/servers/${server.id}/stats`);
          if (res.ok) {
            const stats = await res.json();
            setServerStats(prev => {
              if (prev[server.id] && prev[server.id].cpu.length > 0) return prev;
              return { ...prev, [server.id]: { cpu: stats.cpu, memory: stats.memory } };
            });
          }
        } catch (e) {}
      }
    });
  }, [data.servers]);

  // Global SSE Stream for live stats and status updates
  useEffect(() => {
    const es = new EventSource("/api/servers/stream");
    
    es.addEventListener("message", (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === "stats") {
          const { serverId, cpu, memory } = payload;
          setServerStats(prev => {
            const cur = prev[serverId] || { cpu: [], memory: [] };
            const nextCpu = [...cur.cpu, cpu];
            const nextMem = [...cur.memory, memory];
            if (nextCpu.length > 30) nextCpu.shift();
            if (nextMem.length > 30) nextMem.shift();
            return { ...prev, [serverId]: { cpu: nextCpu, memory: nextMem } };
          });
          
          setData(prevData => ({
            ...prevData,
            servers: prevData.servers.map((s: any) => 
              s.id === serverId ? { ...s, cpuUsage: cpu, memoryUsage: memory } : s
            )
          }));
        } else if (payload.type === "status") {
          const { serverId, status, healthStatus } = payload;
          setData(prevData => ({
            ...prevData,
            servers: prevData.servers.map((s: any) => {
              if (s.id === serverId) {
                return { 
                  ...s, 
                  ...(status !== undefined && { status }),
                  ...(healthStatus !== undefined && { healthStatus })
                };
              }
              return s;
            })
          }));
        }
      } catch (err) {}
    });

    return () => es.close();
  }, []);

  // Poll install/download progress for servers that are STARTING or UPDATING
  useEffect(() => {
    const inProgress = data.servers.filter(
      (s: any) => s.status === "STARTING" || s.status === "UPDATING"
    );
    if (inProgress.length === 0) {
      return;
    }
    const fetchProgress = async () => {
      for (const server of inProgress) {
        try {
          const res = await fetch(`/api/servers/${server.id}/progress`);
          if (res.ok) {
            const body = await res.json();
            setProgressMap((prev) => ({ ...prev, [server.id]: body.progress }));
          }
        } catch (e) {}
      }
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 1500);
    return () => clearInterval(interval);
  }, [data.servers]);

  // Update game server handler


  const handleOpenServerFolder = async (serverId: string) => {
    try {
      const res = await fetch("/api/system/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId }),
      });
      const data = await res.json();
      if (!data.ok) addToast("error", data.error || "Could not open server folder");
    } catch {
      addToast("error", "Could not open server folder");
    }
  };



  // Power action: START, STOP, RESTART
  const handlePowerAction = async (serverId: string, action: "start" | "stop" | "restart") => {
    setActionLoading(`${serverId}-${action}`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/${action}`, {
        method: "POST",
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || `Failed to ${action} server`);

      // Update local state immediately
      setData(prev => ({
        ...prev,
        servers: prev.servers.map(s => s.id === serverId ? updated : s)
      }));

      // Force refresh logs shortly after
      const logRes = await fetch("/api/servers", { cache: "no-store" });
      if (logRes.ok) {
        const fresh = await logRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Archive / Vault Server
  const handleArchiveServer = async (serverId: string) => {
    setActionLoading(`${serverId}-archive`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/archive`, {
        method: "POST",
      });
      const archive = await res.json();
      if (!res.ok) throw new Error(archive.error || "Failed to vault server");

      // Refetch whole state because a server was deleted and an archive created
      const stateRes = await fetch("/api/servers", { cache: "no-store" });
      if (stateRes.ok) {
        const fresh = await stateRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Restore Archive
  const handleRestoreArchive = async (archiveId: string) => {
    setActionLoading(`${archiveId}-restore`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/archives/${archiveId}/restore`, {
        method: "POST",
      });
      const restored = await res.json();
      if (!res.ok) throw new Error(restored.error || "Failed to restore server");

      // Refetch whole state
      const stateRes = await fetch("/api/servers", { cache: "no-store" });
      if (stateRes.ok) {
        const fresh = await stateRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete Archive
  const handleDeleteArchive = (archiveId: string) => {
    showModal({
      type: "warning",
      title: "Delete Vaulted World",
      message: "Are you sure you want to permanently delete this vaulted game world? This cannot be undone.",
      confirmText: "Delete Permanently",
      cancelText: "Cancel",
      onConfirm: async () => {
        setActionLoading(`${archiveId}-delete`);
        setErrorMessage(null);
        try {
          const res = await fetch(`/api/archives/${archiveId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || "Failed to delete archive");
          }

          // Refetch whole state
          const stateRes = await fetch("/api/servers");
          if (stateRes.ok) {
            const fresh = await stateRes.json();
            setData(fresh);
          }
        } catch (err: any) {
          setErrorMessage(err.message);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  // Import World
  const handleImportWorld = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importMapServer) return;
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const res = await fetch(`/api/servers/${importMapServer.id}/import-world`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: importWorldPath }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to import world");

      setImportSuccess(resData.message || "Map imported successfully!");
      setImportWorldPath("");
      
      // Refresh system activity logs
      const stateRes = await fetch("/api/servers");
      if (stateRes.ok) {
        const fresh = await stateRes.json();
        setData(fresh);
      }
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  // RealmSync Invite
  const handleGenerateInvite = async (serverId: string) => {
    setActionLoading(`${serverId}-invite`);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/invite`, { method: "POST" });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to generate invite code");
      
      setData((prev: any) => ({
        ...prev,
        servers: prev.servers.map((s: any) => 
          s.id === serverId ? { ...s, inviteCode: resData.inviteCode } : s
        )
      }));
      addToast("success", "Invite link generated!");
    } catch (err: any) {
      setErrorMessage(err.message);
      addToast("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };



  // Aggregate Vault metrics
  const totalVaultSize = data.archives.reduce((acc, cur) => acc + cur.saveSizeGB, 0).toFixed(2);

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      
      {/* Sidebar Navigation */}
      <SidebarNavigation user={data.user} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        
        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-8 pb-24 md:pb-8 flex flex-col gap-8">
          
          <div className="flex gap-8 items-start w-full">
            {/* Center Column: KPI, Servers */}
            <div className="flex-1 max-w-7xl space-y-8 min-w-0">
              
              {/* KPI Cards */}
              <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] p-5 shadow-xl hover:-translate-y-1 transition-transform group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 mb-1">Local Servers</div>
                    <div className="text-2xl font-black text-white">{data.servers.filter((s:any) => s.runnerType === "LOCAL").length}</div>
                    <div className="text-xs text-emerald-400 font-bold mt-2 flex items-center gap-1"><Check className="w-3 h-3"/> Running Smooth</div>
                  </div>
                  <div className="p-2 bg-accentPurple/10 text-accentPurple rounded-xl group-hover:scale-110 transition-transform">
                    <ServerIcon className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] p-5 shadow-xl hover:-translate-y-1 transition-transform group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 mb-1">Vaulted Worlds</div>
                    <div className="text-2xl font-black text-white">{data.archives.length}</div>
                    <div className="text-xs text-blue-400 font-bold mt-2 flex items-center gap-1"><Archive className="w-3 h-3"/> Safely Archived</div>
                  </div>
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl group-hover:scale-110 transition-transform">
                    <Layers className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] p-5 shadow-xl hover:-translate-y-1 transition-transform group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 mb-1">Vault Size</div>
                    <div className="text-2xl font-black text-white">{totalVaultSize} GB</div>
                    <div className="text-xs text-slate-400 font-bold mt-2 flex items-center gap-1"><Database className="w-3 h-3"/> Local Storage</div>
                  </div>
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:scale-110 transition-transform">
                    <Database className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] p-5 shadow-xl hover:-translate-y-1 transition-transform group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 mb-1">Global Ping</div>
                    <div className="text-2xl font-black text-white">12ms</div>
                    <div className="text-xs text-emerald-400 font-bold mt-2 flex items-center gap-1"><Activity className="w-3 h-3"/> Excellent</div>
                  </div>
                  <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl group-hover:scale-110 transition-transform">
                    <Activity className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </section>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl font-medium text-sm flex justify-between items-center shadow-lg shadow-red-500/5">
                <span>{errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Active Servers Hero Grid */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <ServerIcon className="w-5 h-5 text-accentPurple" />
                  <span>Active Servers</span>
                </h2>
                <Link
                  href="/dashboard/servers/new"
                  className="px-4 py-2 rounded-xl bg-accentPurple hover:bg-accentPurple/90 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-accentPurple/25 hover:-translate-y-0.5"
                >
                  <Plus className="w-4 h-4" />
                  Deploy New Server
                </Link>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                {data.servers.map((server: any) => (
                  <ServerHeroCard
                    key={server.id}
                    server={server}
                    serverStats={serverStats[server.id]}
                    progressMap={progressMap}
                    isServerLoading={actionLoading?.split("-")[0] === server.id}
                    copiedIp={copiedIp}
                    isSelected={selectedServerId === server.id}
                    onSelect={() => setSelectedServerId(server.id)}
                    actions={{
                      handlePowerAction,
                      handleArchiveServer,
                      handleOpenServerFolder,
                      setAdvisorServer,
                      setImportMapServer,
                      setImportWorldPath,
                      setImportError,
                      setImportSuccess,
                      setCopiedIp,
                      handleGenerateInvite
                    }}
                  />
                ))}
                {data.servers.length === 0 && (
                  <div className="col-span-full py-16 flex flex-col items-center justify-center border border-white/5 border-dashed rounded-[18px] bg-slate-900/20">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                      <ServerIcon className="w-8 h-8 text-slate-500" />
                    </div>
                    <h3 className="font-extrabold text-lg text-white mb-2">No Active Servers</h3>
                    <p className="text-slate-400 text-sm mb-6 max-w-sm text-center">Deploy a new dedicated server to get started. RealmSwap handles the installation and port forwarding automatically.</p>
                    <Link
                      href="/dashboard/servers/new"
                      className="px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurple/90 text-white font-bold text-sm transition-all shadow-lg shadow-accentPurple/25"
                    >
                      Deploy First Server
                    </Link>
                  </div>
                )}
              </div>
            </section>
            </div>
            
            {/* Right Column: Server Health */}
            <HealthSidebar 
              server={data.servers.find((s: any) => s.id === selectedServerId) || data.servers[0]} 
            />
          </div>

          {/* Vault and Feed Row */}
          <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-8 h-[420px] items-stretch w-full max-w-[calc(1280px+320px+2rem)]">
            <VaultSection archives={data.archives} actions={{ handleRestoreArchive, handleDeleteArchive }} actionLoading={actionLoading} />
            <ActivityFeed activityLogs={data.activityLogs} />
          </div>
          
        </main>
      </div>

      {advisorServer && (
          <CloudAdvisorModal
            onClose={() => setAdvisorServer(null)}
            serverId={advisorServer.id}
            serverName={advisorServer.name}
            onMigrateSuccess={() => {
              setAdvisorServer(null);
              // Optimistically refresh the state
              fetch("/api/servers", { cache: "no-store" })
                .then(r => r.ok && r.json())
                .then(fresh => fresh && setData(fresh));
            }}
          />
      )}

      {/* Import Map Dialog Overlay */}
      {importMapServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl flex flex-col shadow-[0_0_40px_rgba(16,185,129,0.15)]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div>
                <h3 className="font-extrabold text-white text-base">Import Existing Map</h3>
                <p className="text-xs text-slate-400">
                  Copy world save data into {importMapServer.name} ({importMapServer.game})
                </p>
              </div>
              <button 
                onClick={() => setImportMapServer(null)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Help guidelines */}
            <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-xs text-slate-300 leading-normal space-y-2 mb-4">
              <span className="font-bold text-white block">Instructions:</span>
              <p>Enter the absolute path to your existing world save folder or file.</p>
            </div>

            <form onSubmit={handleImportWorld} className="flex flex-col gap-4">
              {importError && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
                  {importError}
                </div>
              )}
              {importSuccess && (
                <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                  {importSuccess}
                </div>
              )}
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  Source Path on Host PC
                </label>
                <input
                  type="text"
                  required
                  placeholder="C:\Users\Name\AppData\..."
                  value={importWorldPath}
                  onChange={(e) => setImportWorldPath(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setImportMapServer(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importLoading || !importWorldPath}
                  className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                  {importLoading ? "Importing..." : "Start Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}