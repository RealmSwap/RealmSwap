"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  LayoutDashboard,
  Plus,
  LogOut,
  Users,
  History,
  Wrench,
  Settings,
  FolderSync,
  Clock,
  Trash2,
  Power,
  RotateCcw,
  AlertTriangle,
  Check,
  TerminalSquare,
  Terminal
} from "lucide-react";
import { useModal } from "@/components/ModalProvider";

interface SchedulesViewProps {
  servers: any[];
  user: any;
}

export default function SchedulesView({ servers, user }: SchedulesViewProps) {
  const router = useRouter();
  const [selectedServer, setSelectedServer] = useState<any | null>(servers[0] || null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Schedule State
  const [showAdd, setShowAdd] = useState(false);
  const [action, setAction] = useState("RESTART");
  const [cronExp, setCronExp] = useState("0 4 * * *");
  const [useCustomCron, setUseCustomCron] = useState(false);
  const [preset, setPreset] = useState("0 4 * * *"); // daily at 4am
  const [broadcastMsg, setBroadcastMsg] = useState("Server restarting in 5 minutes!");
  const [broadcastMin, setBroadcastMin] = useState("5");

  useEffect(() => {
    if (selectedServer) {
      fetchSchedules(selectedServer.id);
    }
  }, [selectedServer]);

  const fetchSchedules = async (serverId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/schedules`);
      if (!res.ok) throw new Error("Failed to fetch schedules");
      const data = await res.json();
      setSchedules(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer) return;
    setError(null);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          cronExpression: useCustomCron ? cronExp : preset,
          broadcastMsg: broadcastMsg.trim() || undefined,
          broadcastMin: broadcastMin.trim() ? parseInt(broadcastMin) : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create schedule");
      
      setSchedules([data, ...schedules]);
      setShowAdd(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggle = async (taskId: string, currentEnabled: boolean) => {
    if (!selectedServer) return;
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/schedules/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        setSchedules(schedules.map(s => s.id === taskId ? { ...s, enabled: !currentEnabled } : s));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!selectedServer) return;
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/schedules/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        setSchedules(schedules.filter(s => s.id !== taskId));
      }
    } catch (err) {
      console.error(err);
    }
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
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group"
            >
              <LayoutDashboard className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
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
              { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
              { label: "Server Config", icon: Settings, href: "/dashboard/config" },
              { label: "Server Console", icon: Terminal, href: "/dashboard/console" },
              { label: "Schedules", icon: Clock, href: "/dashboard/schedules", active: true },
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

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
              <Clock className="w-8 h-8 text-accentPurple" />
              Scheduled Actions
            </h1>
            <p className="text-slate-400 mt-2 text-sm font-medium">Automate routine server tasks with cron schedules.</p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 rounded-xl bg-accentPurple hover:bg-accentPurpleHover text-sm font-bold text-white transition-colors flex items-center gap-2"
          >
            {showAdd ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAdd ? "Cancel" : "Add Schedule"}
          </button>
        </div>

        {/* Server Target Bar */}
        <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-1">Target Server</span>
            <span className="text-[11px] text-mutedText">Select which server to configure schedules for.</span>
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

        {error && (
          <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3 animate-slide-down">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {showAdd && selectedServer && (
          <div className="glass-panel p-6 rounded-2xl border border-white/10 mb-8 animate-slide-down">
            <h3 className="text-lg font-bold text-white mb-4">New Schedule for {selectedServer.name}</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Action</label>
                  <select 
                    value={action} 
                    onChange={(e) => setAction(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accentPurple outline-none"
                  >
                    <option value="RESTART">Restart Server</option>
                    <option value="START">Start Server</option>
                    <option value="STOP">Stop Server</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Schedule Time</span>
                    <button type="button" onClick={() => setUseCustomCron(!useCustomCron)} className="text-[10px] text-accentPurple hover:underline">
                      {useCustomCron ? "Use Presets" : "Custom Cron"}
                    </button>
                  </label>
                  
                  {useCustomCron ? (
                    <input
                      type="text"
                      value={cronExp}
                      onChange={(e) => setCronExp(e.target.value)}
                      placeholder="0 4 * * *"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:border-accentPurple outline-none"
                    />
                  ) : (
                    <select 
                      value={preset} 
                      onChange={(e) => setPreset(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accentPurple outline-none"
                    >
                      <option value="0 4 * * *">Every Day at 4:00 AM</option>
                      <option value="0 12 * * *">Every Day at 12:00 PM</option>
                      <option value="0 * * * *">Every Hour</option>
                      <option value="0 4 * * 0">Every Sunday at 4:00 AM</option>
                      <option value="*/30 * * * *">Every 30 Minutes</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-4">
                <h4 className="text-sm font-bold text-slate-300">Pre-Action Broadcast (Optional)</h4>
                <p className="text-xs text-mutedText leading-relaxed max-w-3xl">
                  Send a warning message to connected players before the action executes. <br/>
                  <span className="text-accentPurple font-medium">Note: Requires native RCON support or a compatible server broadcast script.</span>
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Warning Message</label>
                    <input
                      type="text"
                      value={broadcastMsg}
                      onChange={(e) => setBroadcastMsg(e.target.value)}
                      placeholder="Server restarting soon!"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accentPurple outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mins Before</label>
                    <input
                      type="number"
                      value={broadcastMin}
                      onChange={(e) => setBroadcastMin(e.target.value)}
                      min="1"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accentPurple outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurpleHover text-sm font-bold text-white transition-colors"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm font-medium animate-pulse">Loading schedules...</div>
        ) : !selectedServer ? (
          <div className="text-center py-24 glass-panel rounded-3xl border border-white/5">
            <Clock className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No Scheduled Tasks</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              You haven't set up any automated actions for this server. 
              Automate daily restarts or standby modes!
            </p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-24 glass-panel rounded-3xl border border-white/5">
            <Clock className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No Scheduled Tasks</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              You haven't set up any automated actions for this server. 
              Automate daily restarts or standby modes!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules.map((task) => (
              <div key={task.id} className={`p-5 rounded-2xl border ${task.enabled ? 'border-white/10 bg-slate-900/50' : 'border-white/5 bg-slate-950/50 opacity-60'} transition-all flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {task.action === "RESTART" && <RotateCcw className="w-4 h-4 text-accentPurple" />}
                      {task.action === "START" && <Power className="w-4 h-4 text-green-400" />}
                      {task.action === "STOP" && <Power className="w-4 h-4 text-red-400" />}
                      <span className="font-extrabold text-white text-sm tracking-wide">{task.action}</span>
                    </div>
                    <button 
                      onClick={() => handleToggle(task.id, task.enabled)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-colors ${task.enabled ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                    >
                      {task.enabled ? 'Active' : 'Paused'}
                    </button>
                  </div>
                  
                  <div className="space-y-2 mt-4">
                    <div className="flex items-center gap-3 text-xs text-slate-300">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-white/5">{task.cronExpression}</span>
                    </div>
                    {task.broadcastMsg && (
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <TerminalSquare className="w-4 h-4 text-slate-500" />
                        <span className="truncate">"{task.broadcastMsg}" (-{task.broadcastMin}m)</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
                  <span className="text-[10px] text-slate-500">
                    Last Run: {task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : 'Never'}
                  </span>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete Schedule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
