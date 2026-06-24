"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Server as ServerIcon, 
  ArrowLeft, 
  Users, 
  Sparkles, 
  LayoutDashboard, 
  Plus, 
  LogOut, 
  History, 
  Wrench,
  FolderSync,
  Trash2,
  PlusCircle,
  Info,
  Check,
  UserPlus,
  Settings
} from "lucide-react";

interface TeamViewProps {
  servers: any[];
  user: any;
}

export default function TeamView({ servers, user }: TeamViewProps) {
  const router = useRouter();
  const [selectedServer, setSelectedServer] = useState<any | null>(servers[0] || null);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("CO_HOST");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load collaborators for selected server
  const loadCollaborators = async (serverId: string) => {
    try {
      const res = await fetch(`/api/servers/${serverId}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data);
      } else {
        console.error("Failed to load collaborators");
      }
    } catch (err) {
      console.error("Error loading collaborators:", err);
    }
  };

  useEffect(() => {
    if (selectedServer) {
      loadCollaborators(selectedServer.id);
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

  // Add collaborator
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to invite collaborator");

      setSuccess(`Invited '${data.user.name}' as ${role === "ADMIN" ? "Admin" : "Co-Host"}!`);
      setEmail("");
      loadCollaborators(selectedServer.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Revoke collaborator access
  const handleRevoke = async (collaborator: any) => {
    if (!selectedServer) return;
    if (!confirm(`Are you sure you want to revoke server control access for '${collaborator.user.name}' (${collaborator.user.email})?`)) return;

    setActionLoading(collaborator.userId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/collaborators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: collaborator.userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke access");

      setSuccess(`Revoked co-management access for '${collaborator.user.name}'.`);
      loadCollaborators(selectedServer.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-slate-100 font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <ServerIcon className="w-6 h-6 text-accentPurple" />
            <span className="font-extrabold text-xl tracking-wider">
              REALM<span className="text-accentPurple text-glow-purple">SWAP</span>
            </span>
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
              { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
              { label: "Server Config", icon: Settings, href: "/dashboard/config" },
              { label: "Team Members", icon: Users, href: "/dashboard/team", active: true },
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

      {/* Main Content Area */}
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
            <Users className="w-6 h-6 text-accentPurple animate-float" />
            <span>Team & Collaborators</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Delegate server controls to your friends so they can start, stop, configure mods, or restore snapshots.</p>
        </div>

        {/* Server Target selector */}
        <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-1">Target Managed Server</span>
            <span className="text-[11px] text-mutedText">Select which of your local servers to configure access permissions for.</span>
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

        {/* Feedback Messages */}
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

        {/* Main Content Layout */}
        {!selectedServer ? (
          <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center bg-slate-950/20">
            <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span className="font-bold text-sm block text-slate-400">No Servers Found</span>
            <p className="text-xs text-mutedText max-w-sm mx-auto mt-1">Please deploy a local game server to invite team collaborators.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left and Middle columns: Collaborators list */}
            <div className="lg:col-span-2 space-y-6">
              
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  <Users className="w-4.5 h-4.5 text-accentPurple" />
                  <span>Authorized Collaborators</span>
                </h3>
                <p className="text-xs text-mutedText">Users listed below have permissions to co-manage the server '{selectedServer.name}'.</p>

                <div className="overflow-x-auto pt-2">
                  {collaborators.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-white/5 bg-slate-950/20 text-center text-xs text-mutedText">
                      No collaborators authorized on this server yet. Invite a friend using the panel below.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950/30 text-mutedText font-bold uppercase border-b border-white/5">
                          <th className="p-3">Name</th>
                          <th className="p-3">Email Address</th>
                          <th className="p-3">Role</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {collaborators.map((col) => {
                          const isRevoking = actionLoading === col.userId;
                          return (
                            <tr key={col.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3 font-bold text-white">{col.user.name}</td>
                              <td className="p-3 text-mutedText">{col.user.email}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide ${
                                  col.role === "ADMIN" 
                                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                }`}>
                                  {col.role === "ADMIN" ? "Admin" : "Co-Host"}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleRevoke(col)}
                                  disabled={loading || !!actionLoading}
                                  className="px-2.5 py-1.5 rounded bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors inline-flex items-center gap-1.5 text-[10px] font-bold"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{isRevoking ? "Revoking..." : "Revoke Access"}</span>
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

              {/* Invite Form panel */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
                <h3 className="font-extrabold text-base text-white">Add Collaborator</h3>
                <p className="text-xs text-mutedText">Invite a registered friend by email to grant them co-management permissions.</p>

                <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1">Friend's Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter register email..."
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-mutedText uppercase tracking-wider block mb-1">Assigned Privilege Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
                    >
                      <option value="CO_HOST">Co-Host (Controls only)</option>
                      <option value="ADMIN">Admin (Full operations)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3 flex justify-end pt-2 border-t border-white/5 mt-2">
                    <button
                      type="submit"
                      disabled={loading || !!actionLoading}
                      className="px-5 py-2 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Grant Server Control</span>
                    </button>
                  </div>
                </form>
              </div>

            </div>

            {/* Right Column: Instructions & Notes */}
            <div className="space-y-6">
              
              {/* Info Box */}
              <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-3">
                <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider block">Invite Process Guidelines</span>
                
                <div className="text-xs text-slate-400 leading-normal space-y-3">
                  <p>👥 **SQLite Registry Requirement:** RealmSwap runs completely locally. In order to invite a friend, they must first connect to your RealmSwap instance (using your public/local IP) and create an account via the Register page.</p>
                  <p>🔐 **Role Privileges:**
                    <br/>• **Co-Host:** Can start, stop, restart, and view live console logs.
                    <br/>• **Admin:** Can also install mods, take manual snapshots, and restore world back-ups.
                  </p>
                  <p>🚫 **Safety Rules:** Collaborators cannot delete/vault the server or invite other collaborators. Only the server owner retains full deletion rights.</p>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>
    </div>
  );
}
