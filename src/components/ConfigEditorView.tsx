"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  LogOut,
  Users,
  Wrench,
  FolderSync,
  History,
  LayoutDashboard,
  Settings,
  Save,
  RefreshCw,
  AlertCircle,
  FileCode,
  Check,
  Info
,
  Clock,
  Terminal} from "lucide-react";

interface ConfigEditorViewProps {
  user: any;
}

export default function ConfigEditorView({ user }: ConfigEditorViewProps) {
  const router = useRouter();

  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<any | null>(null);
  const [configContent, setConfigContent] = useState("");
  const [configFilename, setConfigFilename] = useState("");
  const [configFormat, setConfigFormat] = useState("");
  const [isEditable, setIsEditable] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalContent, setOriginalContent] = useState("");

  // Fetch servers on mount
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const res = await fetch("/api/servers");
        if (res.ok) {
          const data = await res.json();
          setServers(data.servers || []);
          if (data.servers?.length > 0 && !selectedServer) {
            loadConfig(data.servers[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch servers:", err);
      }
    };
    fetchServers();
  }, []);

  const loadConfig = async (server: any) => {
    setSelectedServer(server);
    setLoading(true);
    setError(null);
    setSuccess(null);
    setHasChanges(false);
    setInfoMessage(null);

    try {
      const res = await fetch(`/api/servers/${server.id}/config`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load config");

      if (!data.editable) {
        setIsEditable(false);
        setConfigContent("");
        setConfigFilename("");
        setConfigFormat("");
        setInfoMessage(data.message || "This game does not support config editing.");
      } else {
        setIsEditable(true);
        setConfigContent(data.content);
        setOriginalContent(data.content);
        setConfigFilename(data.filename);
        setConfigFormat(data.format);
      }
    } catch (err: any) {
      setError(err.message);
      setIsEditable(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedServer || !isEditable) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: configContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save config");

      setSuccess("Configuration saved successfully!");
      setOriginalContent(configContent);
      setHasChanges(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleContentChange = (value: string) => {
    setConfigContent(value);
    setHasChanges(value !== originalContent);
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

  const getGameIcon = (game: string) => {
    switch (game?.toUpperCase()) {
      case "MINECRAFT": return "⛏️";
      case "VALHEIM": return "⛵";
      case "ENSHROUDED": return "🔥";
      case "ZOMBOID": return "🧟";
      case "ARK": return "🦖";
      case "TERRARIA": return "🌳";
      case "PALWORLD": return "🦊";
      case "RUST": return "⚙️";
      default: return "🎮";
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-slate-100">

      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>

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
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-4 h-4 text-slate-500" />
                <span>Create Server</span>
              </div>
            </Link>

            <div className="pt-4 pb-2 px-3">
              <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider">Features</span>
            </div>

            {[
              { label: "Mod Manager", icon: Wrench, href: "/dashboard/mods" },
              { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
              { label: "Server Config", icon: Settings, href: "/dashboard/config", active: true },
              { label: "Server Console", icon: Terminal, href: "/dashboard/console" },
              { label: "Schedules", icon: Clock, href: "/dashboard/schedules" },
              { label: "Team Members", icon: Users, href: "/dashboard/team" },
              { label: "Audit Logs", icon: History, href: "/dashboard/logs" }
            ].map((link, i) => (
              <Link
                key={i}
                href={link.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  link.active
                    ? "bg-accentPurple/10 text-white border border-accentPurple/20"
                    : "hover:bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <link.icon className={`w-4 h-4 ${link.active ? "text-accentPurple" : "text-slate-500"}`} />
                  <span>{link.label}</span>
                </div>
              </Link>
            ))}
          </nav>
        </div>

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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-accentPurple" />
            <span>Server Configuration Editor</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Edit game server configuration files directly from your browser.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-6xl">

          {/* Server Selector Panel */}
          <div className="lg:col-span-1">
            <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-slate-950/30">
                <span className="text-xs font-bold text-mutedText uppercase tracking-wider">Select Server</span>
              </div>
              <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto">
                {servers.length === 0 ? (
                  <div className="p-4 text-center">
                    <span className="text-xs text-mutedText">No servers found. Create one first.</span>
                  </div>
                ) : (
                  servers.map((server) => (
                    <button
                      key={server.id}
                      onClick={() => loadConfig(server)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2.5 ${
                        selectedServer?.id === server.id
                          ? "bg-accentPurple/10 border border-accentPurple/20 text-white"
                          : "hover:bg-white/5 text-slate-400 hover:text-white border border-transparent"
                      }`}
                    >
                      <span className="text-lg">{getGameIcon(server.game)}</span>
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs block truncate">{server.name}</span>
                        <span className="text-[10px] text-mutedText block">{server.game}</span>
                      </div>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        server.status === "RUNNING" ? "bg-emerald-400" :
                        server.status === "CRASHED" ? "bg-red-400" :
                        "bg-slate-600"
                      }`}></span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Editor Panel */}
          <div className="lg:col-span-3">
            <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
              {/* Editor Header */}
              <div className="p-4 border-b border-white/5 bg-slate-950/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileCode className="w-4 h-4 text-accentPurple" />
                  <span className="font-bold text-sm text-white">
                    {configFilename || "No file selected"}
                  </span>
                  {configFormat && isEditable && (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono border border-white/5">
                      {configFormat.toUpperCase()}
                    </span>
                  )}
                  {hasChanges && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold">
                      Unsaved Changes
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedServer && isEditable && (
                    <>
                      <button
                        onClick={() => loadConfig(selectedServer)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/5 hover:border-white/10 text-xs font-bold text-slate-300 transition-colors flex items-center gap-1.5"
                        title="Reload from disk"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reload
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || !hasChanges || selectedServer?.status === "RUNNING"}
                        className="px-4 py-1.5 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/30 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5 border border-accentPurple/30"
                      >
                        {saving ? (
                          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                        ) : success ? (
                          <><Check className="w-3.5 h-3.5" /> Saved!</>
                        ) : (
                          <><Save className="w-3.5 h-3.5" /> Save Changes</>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {selectedServer?.status === "RUNNING" && isEditable && (
                <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Stop the server before editing configuration files to prevent data corruption.</span>
                </div>
              )}

              {error && (
                <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="px-4 py-3 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* Editor Body */}
              <div className="p-0">
                {loading ? (
                  <div className="p-12 text-center">
                    <RefreshCw className="w-6 h-6 text-accentPurple animate-spin mx-auto mb-3" />
                    <span className="text-xs text-mutedText">Loading configuration...</span>
                  </div>
                ) : !selectedServer ? (
                  <div className="p-12 text-center">
                    <Settings className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <span className="text-sm font-bold text-slate-400">Select a server to edit its config</span>
                  </div>
                ) : infoMessage ? (
                  <div className="p-8">
                    <div className="p-5 rounded-xl bg-accentPurple/5 border border-accentPurple/20 text-sm text-slate-300 flex gap-3">
                      <Info className="w-5 h-5 text-accentPurple flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-white block mb-1">No Config File Available</span>
                        <p className="leading-relaxed text-xs">{infoMessage}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={configContent}
                    onChange={(e) => handleContentChange(e.target.value)}
                    readOnly={selectedServer?.status === "RUNNING"}
                    className="w-full min-h-[500px] p-5 bg-black/60 text-emerald-400 font-mono text-[12px] leading-relaxed resize-y outline-none border-none selection:bg-emerald-500/20 placeholder:text-slate-600"
                    placeholder="Configuration file content will appear here..."
                    spellCheck={false}
                  />
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
