"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderSync,
  Sparkles,
  LayoutDashboard,
  Plus,
  LogOut,
  Users,
  History,
  Wrench,
  Download,
  Info,
  Check,
  AlertTriangle,
  Clock,
  Trash2,
  Settings,
  ShieldAlert
,
  Terminal} from "lucide-react";
import { useModal } from "@/components/ModalProvider";

interface BackupsViewProps {
  servers: any[];
  user: any;
}

export default function BackupsView({ servers, user }: BackupsViewProps) {
  const router = useRouter();
  const [selectedServer, setSelectedServer] = useState<any | null>(servers[0] || null);
  const [backups, setBackups] = useState<any[]>([]);
  const [customBackupName, setCustomBackupName] = useState("");
  const [snapshotInterval, setSnapshotInterval] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { showModal } = useModal();

  // Fetch backups for the selected server
  const loadBackups = async (serverId: string) => {
    try {
      const res = await fetch(`/api/servers/${serverId}/backups`);
      if (res.ok) {
        const data = await res.json();
        setBackups(data);
      } else {
        console.error("Failed to load backups");
      }
    } catch (err) {
      console.error("Error loading backups:", err);
    }
  };

  useEffect(() => {
    if (selectedServer) {
      loadBackups(selectedServer.id);
      setSnapshotInterval(selectedServer.snapshotInterval || 0);
      setError(null);
      setSuccess(null);
    }
  }, [selectedServer]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Change automated snapshot interval setting
  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/backups/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotInterval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update backup interval");

      setSuccess("Backup schedule updated successfully!");
      // Update selectedServer state
      selectedServer.snapshotInterval = snapshotInterval;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Take a manual backup snapshot
  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customName: customBackupName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create snapshot");

      setSuccess(`Snapshot '${data.name}' created successfully!`);
      setCustomBackupName("");
      loadBackups(selectedServer.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Restore backup
  const handleRestore = (backup: any) => {
    if (!selectedServer) return;
    
    showModal({
      type: "warning",
      title: "Restore Snapshot",
      message: `WARNING: Restoring the snapshot '${backup.name}' will OVERWRITE the current world save of the server '${selectedServer.name}'.\n\nThis action cannot be undone. Are you sure you want to restore?`,
      confirmText: "Restore World",
      cancelText: "Cancel",
      onConfirm: async () => {
        setActionLoading(`${backup.id}-restore`);
        setError(null);
        setSuccess(null);

        try {
          const res = await fetch(`/api/backups/${backup.id}/restore`, {
            method: "POST",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to restore snapshot");

          setSuccess(`Successfully restored world to snapshot '${backup.name}'!`);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  // Delete backup
  const handleDelete = (backup: any) => {
    showModal({
      type: "error",
      title: "Delete Snapshot",
      message: `Are you sure you want to permanently delete snapshot '${backup.name}'?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        setActionLoading(`${backup.id}-delete`);
        setError(null);
        setSuccess(null);

        try {
          const res = await fetch(`/api/backups/${backup.id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to delete snapshot");

          setSuccess("Snapshot permanently deleted.");
          loadBackups(selectedServer.id);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  return (
    <div className="min-h-screen flex bg-background text-slate-100 font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <Link 
              href="/dashboard" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all"
            >
              <LayoutDashboard className="w-4 h-4 text-slate-500" />
              <span>Dashboard</span>
            </Link>
            
            <Link 
              href="/dashboard/servers/new" 
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                <span>Create Server</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">Unlimited</span>
            </Link>

            <div className="pt-4 pb-2 px-3">
              <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider">Features</span>
            </div>

            {[
              { label: "Mod Manager", icon: Wrench, href: "/dashboard/mods" },
              { label: "World Backups", icon: FolderSync, href: "/dashboard/backups", active: true },
              { label: "Server Config", icon: Settings, href: "/dashboard/config" },
              { label: "Server Console", icon: Terminal, href: "/dashboard/console" },
              { label: "Schedules", icon: Clock, href: "/dashboard/schedules" },
              { label: "Team Members", icon: Users, href: "/dashboard/team" },
              { label: "Audit Logs", icon: History, href: "/dashboard/logs" }
            ].map((link, i) => (
              <Link 
                key={i} 
                href={link.href} 
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all group ${
                  link.active 
                    ? "bg-accentPurple/10 text-white border border-accentPurple/20" 
                    : "hover:bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <link.icon className={`w-4 h-4 ${link.active ? "text-accentPurple" : "text-slate-500 group-hover:text-white transition-colors"}`} />
                  <span>{link.label}</span>
                </div>
              </Link>
            ))}
          </nav>
        </div>

        {/* Profile Card */}
        <div className="p-4 border-t border-borderDark bg-slate-950/40">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <span className="font-bold text-sm block truncate text-slate-200">{user.name}</span>
              <span className="text-xs text-mutedText block truncate">{user.email}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-white/5 text-slate-400 hover:text-red-400 rounded-lg transition-colors flex-shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-8">
        
        {/* Navigation back */}
        <div className="mb-6">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <FolderSync className="w-6 h-6 text-accentPurple animate-float" />
            <span>World Backups & Snapshots</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Configure automated world save backups, take manual snapshots, and restore world files instantly.</p>
        </div>

        {/* Server Target Bar */}
        <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-1">Target Server Folder</span>
            <span className="text-[11px] text-mutedText">Select which local game server to view backups for.</span>
          </div>

          <div className="min-w-[200px]">
            {servers.length === 0 ? (
              <span className="text-xs text-red-400 font-bold">No servers deployed yet</span>
            ) : (
              <select
                value={selectedServer?.id || ""}
                onChange={(e) => {
                  const s = servers.find(srv => srv.id === e.target.value);
                  setSelectedServer(s || null);
                }}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
              >
                {servers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.game})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3 animate-slide-down">
            <Info className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 mb-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-3 animate-slide-down">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Dashboard Panels */}
        {!selectedServer ? (
          <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center bg-slate-950/20">
            <FolderSync className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span className="font-bold text-sm block text-slate-400">No Servers Found</span>
            <p className="text-xs text-mutedText max-w-sm mx-auto mt-1">Please deploy a local game server to enable backups configuration.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left and Middle Columns */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Backups List Table */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  <History className="w-4.5 h-4.5 text-accentPurple" />
                  <span>Snapshot History</span>
                </h3>
                <p className="text-xs text-mutedText">Saved points in time containing your game saves. Restoring a snapshot replaces the active world.</p>

                <div className="overflow-x-auto pt-2">
                  {backups.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-white/5 bg-slate-950/20 text-center text-xs text-mutedText">
                      No backups or snapshots exist for this server yet. Set a schedule or click "Create Manual Backup".
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950/30 text-mutedText font-bold uppercase border-b border-white/5">
                          <th className="p-3">Snapshot Name</th>
                          <th className="p-3">Date Taken</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Size</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {backups.map((backup) => {
                          const isRestoring = actionLoading === `${backup.id}-restore`;
                          const isDeleting = actionLoading === `${backup.id}-delete`;
                          
                          return (
                            <tr key={backup.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3 font-bold text-white max-w-[200px] truncate">{backup.name}</td>
                              <td className="p-3 text-mutedText">
                                {new Date(backup.createdAt).toLocaleString()}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide ${
                                  backup.backupType === "AUTOMATED"
                                    ? "bg-accentPurple/20 text-accentPurple border border-accentPurple/30"
                                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                }`}>
                                  {backup.backupType}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-[10px] text-slate-300">
                                {backup.fileSizeMB ? `${backup.fileSizeMB} MB` : "Calculating..."}
                              </td>
                              <td className="p-3 text-right space-x-2">
                                <button
                                  onClick={() => handleRestore(backup)}
                                  disabled={loading || !!actionLoading || selectedServer.status === "RUNNING"}
                                  className="px-3 py-1.5 rounded bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/40 disabled:cursor-not-allowed text-[10px] font-bold text-white transition-colors"
                                >
                                  {isRestoring ? "Restoring..." : "Restore"}
                                </button>
                                <button
                                  onClick={() => handleDelete(backup)}
                                  disabled={loading || !!actionLoading}
                                  className="p-1.5 rounded bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors inline-flex items-center"
                                  title="Delete Snapshot"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Manual Backup Panel */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                <h3 className="font-extrabold text-base text-white">Create Manual Backup</h3>
                <p className="text-xs text-mutedText">Take an immediate local zip snapshot of the current save state folder.</p>
                
                <form onSubmit={handleCreateSnapshot} className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1">Optional Snapshot Label</label>
                    <input
                      type="text"
                      value={customBackupName}
                      onChange={(e) => setCustomBackupName(e.target.value)}
                      placeholder="e.g. pre-boss fight, world update..."
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !!actionLoading}
                    className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Take Snapshot</span>
                  </button>
                </form>
              </div>

            </div>

            {/* Right Column: Settings & Lock Warnings */}
            <div className="space-y-6">
              
              {/* Automated Schedule Settings */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Settings className="w-4.5 h-4.5 text-accentPurple" />
                  <h3 className="font-extrabold text-base text-white">Snapshot Schedule</h3>
                </div>
                <p className="text-xs text-mutedText leading-normal">Configure the RealmSwap runner to automatically package and zip local files on a recurring timer.</p>

                <form onSubmit={handleUpdateSchedule} className="space-y-4 pt-2">
                  <div>
                    <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1.5">Interval Frequency</label>
                    <select
                      value={snapshotInterval}
                      onChange={(e) => setSnapshotInterval(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
                    >
                      <option value={0}>Disabled</option>
                      <option value={1}>Every Hour</option>
                      <option value={6}>Every 6 Hours</option>
                      <option value={12}>Every 12 Hours</option>
                      <option value={24}>Daily (Every 24 Hours)</option>
                    </select>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={loading || !!actionLoading}
                      className="w-full px-4 py-2 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
                    >
                      Save Schedule Settings
                    </button>
                  </div>
                </form>
              </div>

              {/* Server State Warnings */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-3">
                <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block">Target Server Status</span>
                
                <div className="flex items-center gap-3">
                  <div className={`w-3.5 h-3.5 rounded-full ${selectedServer.status === "RUNNING" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></div>
                  <div>
                    <span className="font-extrabold text-sm text-slate-200 block">{selectedServer.name}</span>
                    <span className="text-[10px] text-mutedText">Status: {selectedServer.status}</span>
                  </div>
                </div>

                {selectedServer.status === "RUNNING" && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex gap-2.5 leading-normal animate-slide-down">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <span className="font-bold block">Restoration Locked</span>
                      <span>You must turn off the server in the dashboard before restoring snapshots. Overwriting live save databases causes severe save corruption.</span>
                    </div>
                  </div>
                )}
                
                {selectedServer.status !== "RUNNING" && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex gap-2.5 leading-normal animate-slide-down">
                    <Check className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <span className="font-bold block">Restore Enabled</span>
                      <span>Server is stopped. Snapshots can be restored safely now.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-3">
                <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block">Local Storage Info</span>
                
                <div className="text-xs text-slate-400 leading-normal space-y-3">
                  <p>📁 **Local path:** Backups are compressed into `.zip` files and stored inside `local-backups/[serverId]` in your RealmSwap folder.</p>
                  <p>⏱️ **Scheduler requirements:** Automated snapshots only execute while the local runner app is running and the target server is active.</p>
                  <p>💾 **Space efficiency:** Backups are compressed to save disk space. Old backups can be deleted at any time to clear up storage.</p>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>
    </div>
  );
}
