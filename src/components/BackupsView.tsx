"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FolderSync,
  Sparkles,
  LayoutDashboard,
  Plus,
  Store,
  LogOut,
  Users,
  History,
  Download,
  Info,
  Check,
  AlertTriangle,
  Clock,
  Trash2,
  Settings,
  ShieldAlert,
  Terminal,
  CloudUpload,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";
import { useModal } from "@/components/ModalProvider";

interface BackupsViewProps {
  servers: any[];
  user: any;
}

import { useSearchParams } from "next/navigation";

export default function BackupsView({ servers, user }: BackupsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serverIdFromUrl = searchParams.get("server");
  
  const [selectedServer, setSelectedServer] = useState<any | null>(
    serverIdFromUrl ? (servers.find(s => s.id === serverIdFromUrl) || servers[0]) : (servers[0] || null)
  );
  
  const [backups, setBackups] = useState<any[]>([]);
  const [customBackupName, setCustomBackupName] = useState("");
  const [snapshotInterval, setSnapshotInterval] = useState<number>(0);
  const [backupRetention, setBackupRetention] = useState<number>(20);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { showModal } = useModal();

  // Offsite (S3) settings — ADMIN-only. Blank credential inputs mean "keep saved".
  const isAdmin = user?.role === "ADMIN";
  const [s3Form, setS3Form] = useState({ endpoint: "", region: "us-east-1", bucket: "", accessKey: "", secretKey: "", enabled: true });
  const [s3Configured, setS3Configured] = useState(false);
  const [s3Loading, setS3Loading] = useState(false);
  const [s3Saving, setS3Saving] = useState(false);
  const [s3Testing, setS3Testing] = useState(false);

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
      setBackupRetention(selectedServer.backupRetention ?? 20);
      setError(null);
      setSuccess(null);
    }
  }, [selectedServer]);

  // Load saved offsite settings once for ADMINs (secrets are never returned —
  // credential inputs stay blank and mean "keep the saved value").
  useEffect(() => {
    if (!isAdmin) return;
    setS3Loading(true);
    fetch("/api/user/s3-settings")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setS3Configured(!!data.configured);
        setS3Form((f) => ({
          ...f,
          endpoint: data.endpoint || "",
          region: data.region || "us-east-1",
          bucket: data.bucket || "",
          enabled: data.enabled !== false,
        }));
      })
      .catch(() => {})
      .finally(() => setS3Loading(false));
  }, [isAdmin]);

  // Save offsite settings
  const handleSaveS3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setS3Saving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/user/s3-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: s3Form.endpoint.trim() || null,
          region: s3Form.region.trim() || "us-east-1",
          bucket: s3Form.bucket.trim(),
          accessKey: s3Form.accessKey.trim() || undefined,
          secretKey: s3Form.secretKey.trim() || undefined,
          enabled: s3Form.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save cloud settings");
      setSuccess(data.message || "Cloud settings saved.");
      setS3Configured(true);
      setS3Form((f) => ({ ...f, accessKey: "", secretKey: "" }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setS3Saving(false);
    }
  };

  // Test offsite credentials against the bucket without saving
  const handleTestS3 = async () => {
    setS3Testing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/user/s3-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: s3Form.endpoint.trim() || null,
          region: s3Form.region.trim() || "us-east-1",
          bucket: s3Form.bucket.trim(),
          accessKey: s3Form.accessKey.trim() || undefined,
          secretKey: s3Form.secretKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection test failed");
      setSuccess(data.message || "Connection succeeded.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setS3Testing(false);
    }
  };

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
        body: JSON.stringify({ snapshotInterval, backupRetention: Number.isFinite(backupRetention) ? backupRetention : 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update backup settings");

      setSuccess(`Backup settings updated successfully!${data.prunedBackups > 0 ? ` Retention removed ${data.prunedBackups} old snapshot(s).` : ""}`);
      // Update selectedServer state
      selectedServer.snapshotInterval = snapshotInterval;
      selectedServer.backupRetention = backupRetention;
      loadBackups(selectedServer.id);
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
  // Re-verify a backup archive on demand
  const handleVerify = async (backup: any) => {
    if (!selectedServer) return;
    setActionLoading(`${backup.id}-verify`);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/backups/${backup.id}/verify`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify backup");
      if (data.success) setSuccess(`'${backup.name}' verified — ${data.entries} entries restorable.`);
      else setError(data.message || `Verification failed for '${backup.name}'.`);
      loadBackups(selectedServer.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestore = (backup: any, offsite = false) => {
    if (!selectedServer) return;

    showModal({
      type: "warning",
      title: "Restore Snapshot",
      message: `WARNING: Restoring the snapshot '${backup.name}'${offsite ? " from its offsite cloud copy" : ""} will OVERWRITE the current world save of the server '${selectedServer.name}'.\n\nThis action cannot be undone. Are you sure you want to restore?`,
      confirmText: "Restore World",
      cancelText: "Cancel",
      onConfirm: async () => {
        setActionLoading(`${backup.id}-restore`);
        setError(null);
        setSuccess(null);

        try {
          const res = await fetch(`/api/backups/${backup.id}/restore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offsite }),
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

  // Per-server snapshot disk usage, derived from the rows already loaded.
  const totalBackupMB = backups.reduce((sum, b) => sum + (Number(b.fileSizeMB) || 0), 0);

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      
      {/* Sidebar Navigation */}
      <SidebarNavigation user={user} />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-8 pb-24 md:pb-8">
        
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
                      No backups yet. Take one manually below, or set a schedule so RealmSwap backs this world up automatically.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950/30 text-mutedText font-bold uppercase border-b border-white/5">
                          <th className="p-3">Snapshot Name</th>
                          <th className="p-3">Date Taken</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Size</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {backups.map((backup) => {
                          const isRestoring = actionLoading === `${backup.id}-restore`;
                          const isDeleting = actionLoading === `${backup.id}-delete`;
                          const isVerifying = actionLoading === `${backup.id}-verify`;
                          const localFileMissing = backup.fileAvailable === false;
                          const canRestoreOffsite = localFileMissing && backup.offsiteStatus === "UPLOADED";

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
                              <td className="p-3">
                                {backup.verifyError ? (
                                  <span
                                    className="px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide bg-red-500/20 text-red-400 border border-red-500/30 cursor-help"
                                    title={backup.verifyError}
                                  >
                                    ⚠ Verify failed
                                  </span>
                                ) : backup.verifiedAt ? (
                                  <span
                                    className="px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-help"
                                    title={`Verified ${new Date(backup.verifiedAt).toLocaleString()}`}
                                  >
                                    ✓ Verified
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide bg-slate-700/40 text-slate-400 border border-white/5">
                                    Unverified
                                  </span>
                                )}
                                {backup.offsiteStatus === "UPLOADED" && (
                                  <span
                                    className="ml-1 px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide bg-blue-500/20 text-blue-300 border border-blue-500/30 cursor-help"
                                    title={`Offsite copy uploaded ${backup.offsiteUploadedAt ? new Date(backup.offsiteUploadedAt).toLocaleString() : ""}`}
                                  >
                                    ☁ Offsite
                                  </span>
                                )}
                                {backup.offsiteStatus === "PENDING" && (
                                  <span className="ml-1 px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide bg-slate-700/40 text-slate-300 border border-white/5">
                                    ☁ Uploading…
                                  </span>
                                )}
                                {backup.offsiteStatus === "FAILED" && (
                                  <span
                                    className="ml-1 px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide bg-red-500/20 text-red-400 border border-red-500/30 cursor-help"
                                    title={backup.offsiteError || "Offsite upload failed"}
                                  >
                                    ☁ Upload failed
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right space-x-2">
                                <button
                                  onClick={() => handleVerify(backup)}
                                  disabled={loading || !!actionLoading}
                                  className="px-3 py-1.5 rounded bg-slate-900 border border-white/5 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-bold text-slate-300 transition-colors"
                                  title="Check that this archive can actually be restored"
                                >
                                  {isVerifying ? "Verifying..." : "Verify"}
                                </button>
                                {canRestoreOffsite ? (
                                  <button
                                    onClick={() => handleRestore(backup, true)}
                                    disabled={loading || !!actionLoading || selectedServer.status === "RUNNING"}
                                    className="px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/40 disabled:cursor-not-allowed text-[10px] font-bold text-white transition-colors"
                                    title="The local file is gone — download the offsite copy and restore it"
                                  >
                                    {isRestoring ? "Restoring..." : "Restore from Cloud"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleRestore(backup)}
                                    disabled={loading || !!actionLoading || selectedServer.status === "RUNNING" || localFileMissing}
                                    title={localFileMissing ? "Local file missing and no offsite copy" : undefined}
                                    className="px-3 py-1.5 rounded bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/40 disabled:cursor-not-allowed text-[10px] font-bold text-white transition-colors"
                                  >
                                    {isRestoring ? "Restoring..." : "Restore"}
                                  </button>
                                )}
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

                  <div>
                    <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1.5">Keep Last N Snapshots</label>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={backupRetention}
                      onChange={(e) => setBackupRetention(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors font-bold"
                    />
                    <p className="text-[10px] text-mutedText mt-1.5 leading-normal">When more snapshots exist, the oldest are deleted automatically. 0 keeps everything. The newest verified snapshot is never deleted.</p>
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

              {/* Offsite Cloud Settings (ADMIN only) */}
              {isAdmin && (
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <FolderSync className="w-4.5 h-4.5 text-blue-400" />
                  <h3 className="font-extrabold text-base text-white">Offsite Cloud Storage (S3)</h3>
                </div>
                <p className="text-xs text-mutedText leading-normal">Automatically replicate every snapshot zip to any S3-compatible cloud bucket (AWS, Cloudflare R2, Backblaze B2). Upload results are recorded per snapshot, and you are notified if an upload fails.</p>

                {s3Loading ? (
                  <p className="text-xs text-mutedText pt-2">Loading saved settings…</p>
                ) : (
                <form onSubmit={handleSaveS3} className="space-y-4 pt-2">
                  <div>
                    <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1.5">S3 Endpoint <span className="normal-case font-normal">(optional — leave blank for AWS)</span></label>
                    <input
                      type="text"
                      value={s3Form.endpoint}
                      onChange={(e) => setS3Form({ ...s3Form, endpoint: e.target.value })}
                      placeholder="e.g. s3.us-east-1.amazonaws.com or accountid.r2.cloudflarestorage.com"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-blue-400 transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1.5">Region</label>
                      <input
                        type="text"
                        value={s3Form.region}
                        onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                        placeholder="us-east-1"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1.5">Bucket Name</label>
                      <input
                        type="text"
                        value={s3Form.bucket}
                        onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })}
                        placeholder="my-server-backups"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1.5">Access Key{s3Configured ? <span className="normal-case font-normal"> (saved)</span> : ""}</label>
                      <input
                        type="password"
                        value={s3Form.accessKey}
                        onChange={(e) => setS3Form({ ...s3Form, accessKey: e.target.value })}
                        placeholder={s3Configured ? "Leave blank to keep saved key" : "••••••••••••"}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1.5">Secret Key{s3Configured ? <span className="normal-case font-normal"> (saved)</span> : ""}</label>
                      <input
                        type="password"
                        value={s3Form.secretKey}
                        onChange={(e) => setS3Form({ ...s3Form, secretKey: e.target.value })}
                        placeholder={s3Configured ? "Leave blank to keep saved key" : "••••••••••••"}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s3Form.enabled}
                      onChange={(e) => setS3Form({ ...s3Form, enabled: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-500"
                    />
                    <span>Upload new snapshots to the bucket automatically</span>
                  </label>
                  <p className="text-[10px] text-mutedText leading-normal">Credentials are encrypted on this machine and used for every server you own. A test upload check runs against the bucket when you click Test — nothing is saved by testing.</p>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={s3Saving || s3Testing || !s3Form.bucket.trim()}
                      onClick={handleTestS3}
                      className="flex-1 px-4 py-2 rounded-lg bg-slate-900 border border-white/10 hover:border-blue-400/40 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-200 transition-colors"
                    >
                      {s3Testing ? "Testing…" : "Test Connection"}
                    </button>
                    <button
                      type="submit"
                      disabled={s3Saving || s3Testing || !s3Form.bucket.trim()}
                      className="flex-1 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
                    >
                      {s3Saving ? "Saving…" : "Save Cloud Settings"}
                    </button>
                  </div>
                </form>
                )}
              </div>
              )}

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
                  <p>💾 **Disk used:** <span className="font-bold text-slate-200">{totalBackupMB.toFixed(1)} MB</span> across {backups.length} snapshot{backups.length === 1 ? "" : "s"} for this server.</p>
                  <p>✂️ **Auto-cleanup:** {backupRetention > 0 ? `Only the last ${backupRetention} snapshots are kept — the oldest are deleted after each new snapshot, and the newest verified snapshot always survives.` : "Snapshots are kept forever (no limit set)."}</p>
                  <p>📁 **Local path:** Backups are compressed into `.zip` files and stored inside `local-backups/[serverId]` in your RealmSwap folder.</p>
                  <p>⏱️ **Scheduler requirements:** Automated snapshots only execute while the local runner app is running and the target server is active.</p>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>
    </div>
  );
}
