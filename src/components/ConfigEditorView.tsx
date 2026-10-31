"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useEffect, useRef } from "react";
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
  SlidersHorizontal,
} from "lucide-react";
import DefinitionParamFields from "@/components/DefinitionParamFields";
import { computeNextRunAt } from "@/lib/automations/schedule";
import { gameIcon as getGameIcon, gameLabel } from "@/lib/gameDisplay";
import { toast } from "sonner";
import { useActiveServer } from "@/components/dashboard/ActiveServerProvider";

interface ConfigEditorViewProps {
  user: any;
}

export default function ConfigEditorView({ user }: ConfigEditorViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialServerId = searchParams.get("server");

  // Shared, persisted selection — follows the user across dashboard pages.
  const { servers, loading: serversLoading, activeServerId, activeServer: contextServer, setActiveServerId } = useActiveServer();
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
  const [activeTab, setActiveTab] = useState<"game" | "files">("game");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Game Settings tab state (schema-driven, from the server's game definition)
  const [gameName, setGameName] = useState("");
  const [gameFields, setGameFields] = useState<any[]>([]);
  const [gameValues, setGameValues] = useState<Record<string, any>>({});
  const [gameSavedValues, setGameSavedValues] = useState<Record<string, any>>({});
  const [supportsGameSettings, setSupportsGameSettings] = useState(true);
  const [gameLoading, setGameLoading] = useState(false);
  const [gameSaving, setGameSaving] = useState(false);
  
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

  // Honor a ?server= deep link once the shared server list has loaded.
  useEffect(() => {
    if (!initialServerId || serversLoading) return;
    if (servers.some((s) => s.id === initialServerId) && activeServerId !== initialServerId) {
      setActiveServerId(initialServerId);
    }
  }, [initialServerId, serversLoading, servers, activeServerId, setActiveServerId]);

  // Load config whenever the shared selection lands on a new server.
  const loadedServerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!contextServer || loadedServerRef.current === contextServer.id) return;
    loadedServerRef.current = contextServer.id;
    loadConfig(contextServer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextServer]);

  const loadConfig = async (server: any) => {
    setSelectedServer(server);
    loadGameSettings(server);
    // Secrets are no longer in the list payload — the SFTP panel fetches them
    // per-server (ADMIN-gated endpoint).
    fetch(`/api/servers/${server.id}/secrets`)
      .then((r) => (r.ok ? r.json() : { sftpPassword: null }))
      .then((d) => {
        setSelectedServer((prev: any) => (prev && prev.id === server.id ? { ...prev, sftpPassword: d.sftpPassword } : prev));
      })
      .catch(() => {});
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

  const loadGameSettings = async (server: any) => {
    setGameLoading(true);
    setSupportsGameSettings(true);
    setGameFields([]);
    setGameValues({});
    setGameSavedValues({});
    try {
      const res = await fetch(`/api/servers/${server.id}/settings`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load game settings");
      setGameName(data.game || server.game);
      setSupportsGameSettings(!!data.supportsSettings);
      setGameFields(data.fields || []);
      const values: Record<string, any> = {};
      for (const f of data.fields || []) values[f.key] = f.value;
      setGameValues(values);
      setGameSavedValues(values);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGameLoading(false);
    }
  };

  const handleGameValueChange = (key: string, value: any) => {
    setGameValues((prev) => ({ ...prev, [key]: value }));
  };

  const gameSettingsDirty = gameFields.some((f) => gameValues[f.key] !== gameSavedValues[f.key]);

  const resetGameSettings = () => {
    const values: Record<string, any> = {};
    for (const f of gameFields) values[f.key] = f.default ?? "";
    setGameValues(values);
  };

  const handleSaveGameSettings = async () => {
    if (!selectedServer || !gameSettingsDirty) return;
    setGameSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paramValues: gameValues }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings");

      setSuccess(data.message || "Settings saved.");
      setGameSavedValues({ ...gameValues });
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGameSaving(false);
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

      setSelectedServer((prev: any) => {
        if (action === "TOGGLE_TUNNEL") return { ...prev, tunnelEnabled: enable };
        if (action === "TOGGLE_AUTO_UPDATE") return { ...prev, autoUpdate: enable };
        if (action === "TOGGLE_IDLE_STOP") return { ...prev, idleStopEnabled: enable };
        if (action === "TOGGLE_AUTO_START_ON_LAUNCH") return { ...prev, autoStartOnLaunch: enable };
        return prev;
      });
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    }
  };

  const setUpdateHour = async (hour: number) => {
    if (!selectedServer) return;
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_UPDATE_HOUR", hour })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedServer((prev: any) => ({ ...prev, autoUpdateHour: hour }));
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    }
  };

  // Generic action + optimistic row patch for the power/automation settings.
  const setServerOption = async (action: string, payload: Record<string, unknown>, patch: Record<string, unknown>) => {
    if (!selectedServer) return;
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedServer((prev: any) => ({ ...prev, ...patch }));
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 3000);
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
      toast.error("Name and description are required.");
      return;
    }
    if (publishMode === "update" && !publishTargetRealmId) {
      toast.error("Choose which realm to publish the new version to.");
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
      toast.success(base);
      if (data.strippedSecrets) {
        toast.info("Sensitive data was automatically removed from the published configuration files.");
      }
      router.push("/dashboard/marketplace");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
      setShowPublishModal(false);
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
                {serversLoading ? (
                  <div className="p-4 text-center">
                    <span className="text-xs text-mutedText">Loading servers…</span>
                  </div>
                ) : servers.length === 0 ? (
                  <div className="p-4 text-center">
                    <span className="text-xs text-mutedText">No servers found. Create one first.</span>
                  </div>
                ) : (
                  servers.map((server) => (
                    <button
                      key={server.id}
                      onClick={() => setActiveServerId(server.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2.5 ${
                        selectedServer?.id === server.id
                          ? "bg-accentPurple/10 border border-accentPurple/20 text-white"
                          : "hover:bg-white/5 text-slate-400 hover:text-white border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs block truncate">{server.name}</span>
                        <span className="text-[10px] text-mutedText block">{gameLabel(server.game)}</span>
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
                  <button onClick={() => setActiveTab("game")} className={`font-bold text-sm ${activeTab === 'game' ? 'text-accentPurple border-b-2 border-accentPurple' : 'text-slate-400 border-b-2 border-transparent hover:text-slate-200'} pb-4 -mb-4 transition-colors flex items-center gap-2`}>
                    <SlidersHorizontal className="w-4 h-4" />
                    Game Settings
                  </button>
                  <button onClick={() => setActiveTab("files")} className={`font-bold text-sm ${activeTab === 'files' ? 'text-accentPurple border-b-2 border-accentPurple' : 'text-slate-400 border-b-2 border-transparent hover:text-slate-200'} pb-4 -mb-4 transition-colors flex items-center gap-2`}>
                    <FileCode className="w-4 h-4" />
                    Configuration Files
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {selectedServer && (
                    <>
                      {activeTab === "game" && supportsGameSettings ? (
                        <>
                          <button
                            onClick={resetGameSettings}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/5 hover:border-white/10 text-xs font-bold text-slate-300 transition-colors"
                            title="Reset all fields to the game's defaults"
                          >
                            Reset to Defaults
                          </button>
                          <button
                            onClick={handleSaveGameSettings}
                            disabled={gameSaving || !gameSettingsDirty}
                            className="px-4 py-1.5 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/30 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5 border border-accentPurple/30"
                          >
                            {gameSaving ? (
                              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                            ) : (
                              <><Save className="w-3.5 h-3.5" /> Save Settings</>
                            )}
                          </button>
                        </>
                      ) : (
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

                      <button
                        onClick={handlePublishClick}
                        className="px-3 py-1.5 rounded-lg bg-accentBlue/20 border border-accentBlue/30 hover:bg-accentBlue/30 text-xs font-bold text-accentBlue transition-colors flex items-center gap-1.5"
                        title="Publish to Community Marketplace"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        Publish
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {selectedServer?.status === "RUNNING" && isEditable && activeTab === "files" && (
                <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Stop the server before editing configuration files to prevent data corruption.</span>
                </div>
              )}

              {selectedServer?.status === "RUNNING" && activeTab === "game" && supportsGameSettings && (
                <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>Server is running — saved settings take effect the next time the server starts.</span>
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
                ) : activeTab === "game" ? (
                  <div className="p-6 space-y-8">
                    {gameLoading ? (
                      <div className="p-12 text-center">
                        <RefreshCw className="w-6 h-6 text-accentPurple animate-spin mx-auto mb-3" />
                        <span className="text-xs text-mutedText">Loading game settings...</span>
                      </div>
                    ) : !supportsGameSettings ? (
                      <div className="p-5 rounded-xl bg-accentPurple/5 border border-accentPurple/20 text-sm text-slate-300 flex gap-3">
                        <Info className="w-5 h-5 text-accentPurple flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-white block mb-1">No structured settings for {gameName || "this game"} (yet)</span>
                          <p className="leading-relaxed text-xs mb-3">
                            This game is configured through its launch arguments or raw configuration files.
                            Use the Configuration Files tab to edit it directly, or re-create the server to change creation-time options.
                          </p>
                          <button
                            onClick={() => setActiveTab("files")}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/5 hover:border-white/10 text-xs font-bold text-slate-300 transition-colors"
                          >
                            Open Configuration Files
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <h3 className="text-lg font-bold text-white">{gameName} Settings</h3>
                          <p className="text-xs text-slate-500 mt-1">
                            The important settings for this game, with safe defaults. Changes apply to config files and launch
                            arguments automatically — no manual file editing needed.
                          </p>
                        </div>
                        <DefinitionParamFields
                          params={gameFields}
                          values={gameValues}
                          onChange={handleGameValueChange}
                        />
                      </>
                    )}

                    {/* Update behavior — lives with the other server-behavior settings */}
                    <div>
                      <h3 className="text-lg font-bold text-white mb-4">Updates</h3>
                      <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">SteamCMD Auto-Updates</h4>
                          <p className="text-xs text-slate-500">Overnight, while the server is stopped: check for and install game updates so starts are instant. A running server is never touched.</p>
                          {selectedServer.autoUpdate && selectedServer.game !== "MINECRAFT" && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Update at</span>
                              <select
                                value={selectedServer.autoUpdateHour ?? 4}
                                onChange={(e) => setUpdateHour(Number(e.target.value))}
                                className="bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-accentPurple"
                              >
                                {Array.from({ length: 24 }, (_, h) => (
                                  <option key={h} value={h}>
                                    {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {selectedServer.autoUpdate && selectedServer.game !== "MINECRAFT" && (
                            <div className="text-[11px] text-slate-500 mt-2">
                              {selectedServer.lastAutoUpdateAt
                                ? <>Last check: <span className="text-slate-400">{new Date(selectedServer.lastAutoUpdateAt).toLocaleString()}</span></>
                                : "Never checked yet"}
                              {" · "}
                              Next window (while stopped):{" "}
                              <span className="text-slate-400">
                                {computeNextRunAt("DAILY", { timeOfDay: `${String(selectedServer.autoUpdateHour ?? 4).padStart(2, "0")}:00` })?.toLocaleString() ?? "—"}
                              </span>
                            </div>
                          )}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={selectedServer.autoUpdate || false} onChange={(e) => toggleSetting("TOGGLE_AUTO_UPDATE", e.target.checked)} disabled={selectedServer.game === "MINECRAFT"} />
                          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple peer-disabled:opacity-50"></div>
                        </label>
                      </div>
                    </div>

                    {/* Power & automation — when this server boots and stops itself */}
                    <div>
                      <h3 className="text-lg font-bold text-white mb-4">Power &amp; Automation</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4 p-4 bg-slate-900 border border-white/5 rounded-lg">
                          <div>
                            <h4 className="text-sm font-bold text-slate-200">Auto-start before sessions</h4>
                            <p className="text-xs text-slate-500 mt-1 max-w-md">Planned Discord sessions boot this server automatically before they start. The session chip on the dashboard shows the boot time.</p>
                          </div>
                          <select
                            value={selectedServer.autoStartLeadMinutes ?? 15}
                            onChange={(e) => setServerOption("SET_AUTO_START_LEAD", { minutes: Number(e.target.value) }, { autoStartLeadMinutes: Number(e.target.value) })}
                            className="bg-slate-950 border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accentPurple shrink-0"
                          >
                            {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                              <option key={m} value={m}>{m === 0 ? "At start time" : `${m} min before`}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-slate-900 border border-white/5 rounded-lg">
                          <div>
                            <h4 className="text-sm font-bold text-slate-200">Stop when idle</h4>
                            <p className="text-xs text-slate-500 mt-1 max-w-md">If nobody is online for this long, stop the server automatically to free RAM and CPU. Player counts are sampled every 5 minutes — a game that doesn&apos;t answer queries is never treated as empty.</p>
                            {selectedServer.idleStopEnabled && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">After</span>
                                <select
                                  value={selectedServer.idleStopMinutes ?? 30}
                                  onChange={(e) => setServerOption("TOGGLE_IDLE_STOP", { enable: true, minutes: Number(e.target.value) }, { idleStopMinutes: Number(e.target.value) })}
                                  className="bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-accentPurple"
                                >
                                  {[15, 30, 45, 60, 90, 120].map((m) => (
                                    <option key={m} value={m}>{m} min empty</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input type="checkbox" className="sr-only peer" checked={selectedServer.idleStopEnabled || false} onChange={(e) => toggleSetting("TOGGLE_IDLE_STOP", e.target.checked)} />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
                          </label>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-slate-900 border border-white/5 rounded-lg">
                          <div>
                            <h4 className="text-sm font-bold text-slate-200">Stop after a session winds down</h4>
                            <p className="text-xs text-slate-500 mt-1 max-w-md">When a planned session started this many hours ago and the server is still empty, stop it automatically.</p>
                          </div>
                          <select
                            value={selectedServer.sessionAutoStopHours ?? 0}
                            onChange={(e) => setServerOption("SET_SESSION_AUTO_STOP", { hours: Number(e.target.value) }, { sessionAutoStopHours: Number(e.target.value) })}
                            className="bg-slate-950 border border-white/10 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accentPurple shrink-0"
                          >
                            {[0, 2, 4, 6, 12, 24].map((h) => (
                              <option key={h} value={h}>{h === 0 ? "Off" : `After ${h}h empty`}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-4 bg-slate-900 border border-white/5 rounded-lg">
                          <div>
                            <h4 className="text-sm font-bold text-slate-200">Start with RealmSwap</h4>
                            <p className="text-xs text-slate-500 mt-1 max-w-md">Dedicated-box mode: boot this server automatically whenever RealmSwap launches. Pair it with &ldquo;start RealmSwap when this PC signs in&rdquo; in App Settings to bring an old laptop or mini-PC up as a server box with zero clicks.</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input type="checkbox" className="sr-only peer" checked={selectedServer.autoStartOnLaunch || false} onChange={(e) => toggleSetting("TOGGLE_AUTO_START_ON_LAUNCH", e.target.checked)} />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
                          </label>
                        </div>
                      </div>
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

                {/* Direct file access — lives with the files tab. The SFTP
                    server serves THIS machine's files; for node servers it
                    would show the node's IP against a server that isn't
                    there, so the panel says so instead. */}
                {activeTab === "files" && selectedServer && selectedServer.runnerType === "AGENT" && (
                <div className="p-6 border-t border-white/5">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <h3 className="text-sm font-bold text-amber-300 mb-1">This server lives on a remote node</h3>
                    <p className="text-sm text-slate-300">
                      SFTP serves files on the machine running RealmSwap, so it can't reach this server's files.
                      Use the Configuration Files tab above instead — its reads and writes run on the node —
                      and manage mods from the server page.
                    </p>
                  </div>
                </div>
                )}
                {activeTab === "files" && selectedServer && selectedServer.runnerType !== "AGENT" && (
                <div className="p-6 border-t border-white/5">
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
                  </div>
                </div>
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
