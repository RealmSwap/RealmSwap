"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  LogOut,
  Users,
  History,
  LayoutDashboard,
  Settings,
  Save,
  RefreshCw,
  AlertCircle,
  FileCode,
  Check,
  Info,
  Clock,
  Terminal,
  Store,
  UploadCloud,
  X,
  Copy,
  FolderOpen,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";

interface ConfigEditorViewProps {
  user: any;
}

export default function ConfigEditorView({ user }: ConfigEditorViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("server");

  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<any | null>(null);
  const [configContent, setConfigContent] = useState("");
  const [configFilename, setConfigFilename] = useState("");
  const [configFormat, setConfigFormat] = useState("");
  const [isEditable, setIsEditable] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "files">("general");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Publish Modal State
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishName, setPublishName] = useState("");
  const [publishDescription, setPublishDescription] = useState("");
  const [publishMode, setPublishMode] = useState<"new" | "update">("new");
  const [publishVersion, setPublishVersion] = useState("1.0.0");
  const [publishChangelog, setPublishChangelog] = useState("");
  const [publishTargetRealmId, setPublishTargetRealmId] = useState("");
  const [myRealms, setMyRealms] = useState<{ id: string; name: string; version: string | null }[]>([]);
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
            const target = initialServerId ? data.servers.find((s: any) => s.id === initialServerId) : null;
            loadConfig(target || data.servers[0]);
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

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleSetting = async (action: string, enable: boolean) => {
    if (!selectedServer) return;
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, enable })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Update local state
      setServers(servers.map(s => {
        if (s.id === selectedServer.id) {
          if (action === "TOGGLE_TUNNEL") return { ...s, tunnelEnabled: enable };
          if (action === "TOGGLE_AUTO_UPDATE") return { ...s, autoUpdate: enable };
        }
        return s;
      }));
      setSelectedServer((prev: any) => {
        if (action === "TOGGLE_TUNNEL") return { ...prev, tunnelEnabled: enable };
        if (action === "TOGGLE_AUTO_UPDATE") return { ...prev, autoUpdate: enable };
        return prev;
      });
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
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

  const handlePublishClick = () => {
    setShowPublishModal(true);
    setPublishName("");
    setPublishDescription("");
  };

  // Load the creator's realms for this game when the publish modal opens, so they
  // can publish a new version of an existing one instead of a brand-new template.
  useEffect(() => {
    if (showPublishModal && selectedServer) {
      fetch(`/api/marketplace/mine?game=${encodeURIComponent(selectedServer.game)}`)
        .then((r) => r.json())
        .then((d) => setMyRealms(d.realms || []))
        .catch(() => {});
    }
  }, [showPublishModal, selectedServer]);

  const submitPublish = async () => {
    if (!selectedServer) return;
    if (publishMode === "new" && (!publishName || !publishDescription)) {
      alert("Name and description are required.");
      return;
    }
    if (publishMode === "update" && !publishTargetRealmId) {
      alert("Choose which realm to publish the new version to.");
      return;
    }
    setSaving(true);
    try {
      // Note: Full implementation of gathering mods/configs goes here.
      // For now we simulate the payload based on current config.
      const payload = {
        version: publishVersion || "1.0.0",
        mods: [],
        configOverrides: [
          {
            path: configFilename,
            strategy: "template",
            content: configContent,
          },
        ],
        startupParams: {},
      };

      const body =
        publishMode === "update"
          ? { realmId: publishTargetRealmId, gameSlug: selectedServer.game, payload, version: publishVersion, changelog: publishChangelog }
          : { name: publishName, description: publishDescription, gameSlug: selectedServer.game, tags: "Community", payload, version: publishVersion, changelog: publishChangelog };

      const res = await fetch("/api/marketplace/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish template");

      const base =
        publishMode === "update"
          ? `Published version ${data.version || publishVersion} to the marketplace!`
          : "Successfully published to Marketplace!";
      alert(
        data.strippedSecrets
          ? base + "\n\nSecurity Notice: Sensitive data (passwords, tokens, API keys) was automatically removed from your configuration files before publishing."
          : base,
      );
      router.push("/dashboard/marketplace");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
      setShowPublishModal(false);
    }
  };

  const getGameIcon = (game: string) => {
    switch(game) {
      case "MINECRAFT": return "⛏️";
      case "VALHEIM": return "⛵";
      case "ENSHROUDED": return "🔥";
      case "ZOMBOID": return "🧟";
      case "ARK": return "🦖";
      case "TERRARIA": return "🌳";
      case "PALWORLD": return "🦊";
      case "RUST": return "⚙️";
      case "SATISFACTORY": return "🏭";
      case "VRISING": return "🦇";
      case "WINDROSE": return "⚔️";
      default: return "🎮";
    }
  };

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">

      {/* Sidebar Navigation */}
      <SidebarNavigation user={user} />

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
                <div className="flex items-center gap-6">
                  <button onClick={() => setActiveTab("general")} className={`font-bold text-sm ${activeTab === 'general' ? 'text-accentPurple border-b-2 border-accentPurple' : 'text-slate-400 border-b-2 border-transparent hover:text-slate-200'} pb-4 -mb-4 transition-colors`}>
                    General Settings
                  </button>
                  <button onClick={() => setActiveTab("files")} className={`font-bold text-sm ${activeTab === 'files' ? 'text-accentPurple border-b-2 border-accentPurple' : 'text-slate-400 border-b-2 border-transparent hover:text-slate-200'} pb-4 -mb-4 transition-colors flex items-center gap-2`}>
                    <FileCode className="w-4 h-4" />
                    Configuration Files
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {selectedServer && (
                    <>
                      {isEditable && (
                        <button
                          onClick={() => loadConfig(selectedServer)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/5 hover:border-white/10 text-xs font-bold text-slate-300 transition-colors flex items-center gap-1.5"
                          title="Reload from disk"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Reload
                        </button>
                      )}
                      
                      <button
                        onClick={handlePublishClick}
                        className="px-3 py-1.5 rounded-lg bg-accentBlue/20 border border-accentBlue/30 hover:bg-accentBlue/30 text-xs font-bold text-accentBlue transition-colors flex items-center gap-1.5"
                        title="Publish to Community Marketplace"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        Publish
                      </button>

                      {isEditable && (
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
                      )}
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
                {!selectedServer ? (
                  <div className="p-12 text-center">
                    <Settings className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <span className="text-sm font-bold text-slate-400">Select a server to edit its settings</span>
                  </div>
                ) : activeTab === "general" ? (
                  <div className="p-6 space-y-8">
                    {/* General Toggles */}
                    <div>
                      <h3 className="text-lg font-bold text-white mb-4">Automation & Networking</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                          <div>
                            <h3 className="text-sm font-bold text-slate-200">Playit.gg Tunneling</h3>
                            <p className="text-xs text-slate-500">Automatically expose this server to the internet without port forwarding.</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={selectedServer.tunnelEnabled || false} onChange={(e) => toggleSetting("TOGGLE_TUNNEL", e.target.checked)} />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                          <div>
                            <h3 className="text-sm font-bold text-slate-200">SteamCMD Auto-Updates</h3>
                            <p className="text-xs text-slate-500">Automatically check for and install game updates when the server starts.</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={selectedServer.autoUpdate || false} onChange={(e) => toggleSetting("TOGGLE_AUTO_UPDATE", e.target.checked)} disabled={selectedServer.game === "MINECRAFT"} />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple peer-disabled:opacity-50"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* SFTP Credentials */}
                    <div>
                      <h3 className="text-lg font-bold text-white mb-4">SFTP Connection Details</h3>
                      <div className="p-4 bg-slate-900 border border-white/5 rounded-lg space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-400">Host (IP)</span>
                          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded border border-white/5">
                            <span className="text-sm text-white font-mono">{selectedServer.ipAddress}</span>
                            <button onClick={() => copyToClipboard(selectedServer.ipAddress, "host")} className="text-slate-500 hover:text-white transition-colors">
                              {copiedKey === "host" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-400">Port</span>
                          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded border border-white/5">
                            <span className="text-sm text-white font-mono">2022</span>
                            <button onClick={() => copyToClipboard("2022", "port")} className="text-slate-500 hover:text-white transition-colors">
                              {copiedKey === "port" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-400">Username</span>
                          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded border border-white/5">
                            <span className="text-sm text-white font-mono">{selectedServer.id}</span>
                            <button onClick={() => copyToClipboard(selectedServer.id, "username")} className="text-slate-500 hover:text-white transition-colors">
                              {copiedKey === "username" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-400">Password</span>
                          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded border border-white/5">
                            <span className="text-sm text-white font-mono blur-[4px] hover:blur-none transition-all cursor-pointer select-all">{selectedServer.sftpPassword || "Not Generated"}</span>
                            <button onClick={() => copyToClipboard(selectedServer.sftpPassword, "password")} className="text-slate-500 hover:text-white transition-colors">
                              {copiedKey === "password" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />
                        Use an FTP client like WinSCP or FileZilla to connect and manage server files directly.
                      </p>
                    </div>
                  </div>
                ) : loading ? (
                  <div className="p-12 text-center">
                    <RefreshCw className="w-6 h-6 text-accentPurple animate-spin mx-auto mb-3" />
                    <span className="text-xs text-mutedText">Loading configuration...</span>
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
                  <>
                    <div className="px-4 py-2 bg-slate-900 border-b border-white/5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">File: {configFilename}</span>
                      {configFormat && <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono border border-white/5">{configFormat.toUpperCase()}</span>}
                    </div>
                    <textarea
                      value={configContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      readOnly={selectedServer?.status === "RUNNING"}
                      className="w-full min-h-[500px] p-5 bg-black/60 text-emerald-400 font-mono text-[12px] leading-relaxed resize-y outline-none border-none selection:bg-emerald-500/20 placeholder:text-slate-600"
                      placeholder="Configuration file content will appear here..."
                      spellCheck={false}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-5 border-b border-slate-800">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-accentBlue" />
                Publish Template
              </h2>
              <button 
                onClick={() => setShowPublishModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
                disabled={saving}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* New template vs. new version of an existing realm */}
              <div className="flex gap-1 p-1 rounded-lg bg-black/40 border border-slate-700">
                <button
                  onClick={() => setPublishMode("new")}
                  disabled={saving}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${publishMode === "new" ? "bg-accentBlue text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                  New template
                </button>
                <button
                  onClick={() => setPublishMode("update")}
                  disabled={saving || myRealms.length === 0}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all disabled:opacity-40 ${publishMode === "update" ? "bg-accentBlue text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                  Update existing{myRealms.length ? ` (${myRealms.length})` : ""}
                </button>
              </div>

              {publishMode === "new" ? (
                <>
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Template Name</label>
                    <input
                      type="text"
                      value={publishName}
                      onChange={e => setPublishName(e.target.value)}
                      className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors"
                      placeholder="e.g. Valheim Hardcore PvP"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-300 mb-1.5">Description</label>
                    <textarea
                      value={publishDescription}
                      onChange={e => setPublishDescription(e.target.value)}
                      className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors resize-none h-24"
                      placeholder="Describe your server setup and configuration..."
                      disabled={saving}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-1.5">Realm to update</label>
                  <select
                    value={publishTargetRealmId}
                    onChange={e => setPublishTargetRealmId(e.target.value)}
                    className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors"
                    disabled={saving}
                  >
                    <option value="">Select a realm…</option>
                    {myRealms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}{r.version ? ` — current v${r.version}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-300 mb-1.5">Version</label>
                <input
                  type="text"
                  value={publishVersion}
                  onChange={e => setPublishVersion(e.target.value)}
                  className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors"
                  placeholder="1.0.0"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-300 mb-1.5">
                  Changelog <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <textarea
                  value={publishChangelog}
                  onChange={e => setPublishChangelog(e.target.value)}
                  className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors resize-none h-16"
                  placeholder="What changed in this version?"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="p-5 bg-slate-950 flex justify-end gap-3 border-t border-slate-800">
              <button 
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 rounded-lg font-bold text-sm hover:bg-white/5 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button 
                onClick={submitPublish}
                disabled={saving || (publishMode === "new" ? (!publishName || !publishDescription) : !publishTargetRealmId)}
                className="flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm bg-accentBlue hover:bg-blue-500 disabled:opacity-50 text-white transition-all shadow-lg shadow-accentBlue/20"
              >
                {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Publishing...</> : <><UploadCloud className="w-4 h-4" /> Publish Now</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
