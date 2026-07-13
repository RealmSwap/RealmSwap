"use client";

import React, { useState, useEffect } from "react";
import { X, Sparkles, Server, Zap, CheckCircle2, ChevronRight, Settings, Loader2, ArrowRight, UploadCloud, DownloadCloud, Plug } from "lucide-react";
import { ProviderMatrix } from "./ProviderMatrix";
import { FilePickerTree } from "./FilePickerTree";
import type { FileEntry } from "@/lib/hosting/types";
import { toast } from "sonner";

interface Props {
  serverId: string;
  serverName: string;
  onClose: () => void;
  onMigrateSuccess: () => void;
}

interface LinkState {
  provider: string;
  host: string;
  port: number;
  username: string;
  remoteBasePath: string;
  lastPushAt?: string | null;
  lastPullAt?: string | null;
  lastError?: string | null;
}

export function CloudAdvisorModal({ serverId, serverName, onClose, onMigrateSuccess }: Props) {
  const [step, setStep] = useState<"ANALYZING" | "READINESS" | "PREFERENCES" | "RECOMMENDATIONS" | "TRANSFER">("ANALYZING");
  const [readiness, setReadiness] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [preferences, setPreferences] = useState({
    priority: "Best Value",
    region: "North America",
    expectedUptime: "24/7"
  });
  
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  
  // Transfer State
  const [form, setForm] = useState({ host: "", port: 22, username: "", password: "", remoteBasePath: "." });
  const [saved, setSaved] = useState<LinkState | null>(null);
  const [confirmStopped, setConfirmStopped] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ percent: number | null; label: string } | null>(null);
  const [picker, setPicker] = useState<null | { direction: "PUSH" | "PULL"; tree: FileEntry[]; checked: string[] }>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const loadLink = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/host-link`);
      const body = await res.json();
      if (body.link) {
        setSaved(body.link);
        setForm((f) => ({ ...f, host: body.link.host, port: body.link.port, username: body.link.username, remoteBasePath: body.link.remoteBasePath, password: "" }));
      }
    } catch {
      setMessage("Failed to load saved connection.");
    }
  };

  useEffect(() => {
    // Initial analyze
    const analyze = async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/advisor/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences })
        });
        const data = await res.json();
        
        setTimeout(() => {
          setReadiness(data.readiness);
          setRecommendations(data.recommendations);
          setStep("READINESS");
        }, 1500);
      } catch (e) {
        toast.error("Failed to analyze server.");
        onClose();
      }
    };
    
    if (step === "ANALYZING") {
      analyze();
    }
  }, [serverId]);

  useEffect(() => {
    if (step === "TRANSFER") {
      loadLink();
    }
  }, [step, serverId]);

  const handleFetchRecommendations = async () => {
    setStep("ANALYZING");
    try {
      const res = await fetch(`/api/servers/${serverId}/advisor/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences })
      });
      const data = await res.json();
      setRecommendations(data.recommendations);
      setSelectedProviderId(data.recommendations[0]?.providerId || null);
      setSelectedPlanId(data.recommendations[0]?.plan?.id || null);
      setStep("RECOMMENDATIONS");
    } catch (e) {
      toast.error("Failed to fetch recommendations.");
    }
  };

  const handleSetupMigration = () => {
    if (!selectedProviderId || !selectedPlanId) return;
    setStep("TRANSFER");
  };

  // Persist the current form to the host link. Returns true on success and
  // reloads the saved state (which clears the password field). Sets an error
  // message on failure. Does not touch `busy` so callers can wrap it.
  const putLink = async (): Promise<boolean> => {
    const res = await fetch(`/api/servers/${serverId}/host-link`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json();
    if (!res.ok) { setMessage(body.error || "Save failed"); return false; }
    await loadLink();
    return true;
  };

  const saveLink = async () => {
    setBusy("save"); setMessage(null);
    const ok = await putLink();
    setBusy(null);
    if (ok) setMessage("Connection saved.");
  };

  // The form has changes not yet persisted to the stored host link. A typed
  // password is always "dirty" because the stored secret is never sent back.
  const isDirty = (): boolean =>
    !saved ||
    !!form.password ||
    form.host !== saved.host ||
    form.port !== saved.port ||
    form.username !== saved.username ||
    form.remoteBasePath !== saved.remoteBasePath;

  const testConn = async () => {
    setBusy("test"); setMessage(null);
    const res = await fetch(`/api/servers/${serverId}/host-link/test`, { method: "POST" });
    const body = await res.json();
    setBusy(null);
    setMessage(body.ok ? "Connection succeeded." : `Connection failed: ${body.error}`);
  };

  const pollProgress = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/progress`);
      if (res.ok) { const b = await res.json(); setProgress(b.progress ? { percent: b.progress.percent, label: b.progress.label } : null); }
    } catch { /* ignore */ }
  };

  const transfer = async (direction: "PUSH" | "PULL") => {
    setBusy(direction); setMessage(null); setProgress(null);
    // Persist any unsaved changes first — most importantly a freshly typed
    // password. The transfer route authenticates with the *stored* secret, so
    // without this the new password would be silently ignored and the upload
    // would keep using the old (possibly wrong) credentials and hang.
    if (isDirty()) {
      const ok = await putLink();
      if (!ok) { setBusy(null); return; }
    }
    const interval = setInterval(pollProgress, 1000);
    try {
      const res = await fetch(`/api/servers/${serverId}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction, confirmRemoteStopped: confirmStopped }) });
      const body = await res.json();
      if (!res.ok) setMessage(body.error || "Transfer failed");
      else {
        const s = body.summary;
        setMessage(`${direction === "PUSH" ? "Pushed" : "Pulled"} ${s?.filesTransferred ?? 0} file(s), ${((s?.bytesTransferred ?? 0) / 1048576).toFixed(1)} MB.${s?.failures?.length ? ` ${s.failures.length} failed.` : ""}`);
        if (direction === "PUSH") {
          toast.success("Successfully pushed to cloud host!");
          onMigrateSuccess();
        }
      }
    } finally {
      clearInterval(interval); setBusy(null); setProgress(null); await loadLink();
    }
  };

  const beginTransfer = async (direction: "PUSH" | "PULL") => {
    setBusy(direction); setMessage(null);
    // Persist unsaved credential/config changes first (and, for PULL, validate
    // the connection) before we can list files.
    if (isDirty()) {
      const ok = await putLink();
      if (!ok) { setBusy(null); return; }
    }
    try {
      const res = await fetch(`/api/servers/${serverId}/transfer/tree?direction=${direction}`);
      const body = await res.json();
      if (!res.ok) { setMessage(body.error || "Failed to load file list"); setBusy(null); return; }
      const topLevel = (body.tree as FileEntry[]).filter((e) => !e.relPath.includes("/")).map((e) => e.relPath);
      const initial: string[] =
        body.includePaths.length ? body.includePaths
        : body.unknownGame ? topLevel
        : body.defaultPaths;
      setPickerError(null);
      setPicker({ direction, tree: body.tree, checked: initial });
    } finally {
      setBusy(null);
    }
  };

  const confirmPicker = async () => {
    if (!picker) return;
    const includePaths = picker.checked;
    setBusy(picker.direction);
    setPickerError(null);
    // Persist the selection, then run the transfer with it.
    const res = await fetch(`/api/servers/${serverId}/host-link`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, password: "", includePaths }),
    });
    if (!res.ok) { const b = await res.json(); setPickerError(b.error || "Failed to save selection"); setBusy(null); return; }
    await loadLink();
    const dir = picker.direction;
    setPicker(null);
    setBusy(null);
    await transfer(dir);
  };

  // Transferable once we either have a saved link or a complete form (which
  // auto-saves on transfer). A new link needs a password; an existing one can
  // reuse the stored secret.
  const connectionReady = saved || (form.host && form.username && form.password);
  const canTransfer = connectionReady && confirmStopped && !busy;

  const selectedProviderName = recommendations.find(r => r.providerId === selectedProviderId)?.name || "Host";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div 
        className="w-full max-w-2xl rounded-2xl bg-slate-950 border border-accentPurple/30 shadow-[0_0_50px_rgba(167,139,250,0.15)] flex flex-col overflow-hidden relative max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accentPurple to-indigo-600 flex items-center justify-center shadow-lg shadow-accentPurple/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Cloud Hosting</h2>
              <p className="text-xs text-slate-400 font-medium">Manage cloud deployment for {serverName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 relative overflow-y-auto">
          {/* STEP: ANALYZING */}
          {step === "ANALYZING" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full border-4 border-slate-800 border-t-accentPurple animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Server className="w-8 h-8 text-accentPurple animate-pulse" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Analyzing Server Footprint</h3>
              <p className="text-sm text-slate-400 max-w-sm">
                Evaluating historical CPU usage, RAM footprint, world size, and installed mods to determine your ideal cloud requirements...
              </p>
            </div>
          )}

          {/* STEP: READINESS */}
          {step === "READINESS" && readiness && (
            <div className="flex flex-col items-center justify-center py-8 animate-fade-in text-center">
              <div className="mb-8 relative">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle cx="64" cy="64" r="60" className="stroke-slate-800" strokeWidth="8" fill="none" />
                  <circle cx="64" cy="64" r="60" className="stroke-accentPurple" strokeWidth="8" fill="none" strokeDasharray="377" strokeDashoffset={377 - (377 * readiness.score) / 100} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-white">{readiness.score}%</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Readiness</span>
                </div>
              </div>

              <h3 className="text-2xl font-black text-white mb-3">
                {readiness.recommendation === "MIGRATE" ? "Time to Upgrade." : "You're Good to Stay Local."}
              </h3>
              <p className="text-slate-400 text-sm max-w-md mb-8">
                {readiness.reasoning}
              </p>

              <div className="flex gap-4">
                <button 
                  onClick={() => setStep("TRANSFER")}
                  className="px-6 py-2.5 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-colors text-sm"
                >
                  I already have a host
                </button>
                <button 
                  onClick={() => setStep("PREFERENCES")}
                  className="px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-purple-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-accentPurple/25 transition-all hover:-translate-y-0.5"
                >
                  Find Cloud Hosts <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP: PREFERENCES */}
          {step === "PREFERENCES" && (
            <div className="animate-fade-in">
              <h3 className="text-xl font-bold text-white mb-2">What's most important to you?</h3>
              <p className="text-sm text-slate-400 mb-6">Customize your recommendations.</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Primary Goal</label>
                  <select 
                    value={preferences.priority}
                    onChange={(e) => setPreferences({...preferences, priority: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-none focus:border-accentPurple transition-colors"
                  >
                    <option>Cheapest</option>
                    <option>Performance</option>
                    <option>Best Value</option>
                    <option>Simplest Setup</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Player Region</label>
                  <select 
                    value={preferences.region}
                    onChange={(e) => setPreferences({...preferences, region: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-none focus:border-accentPurple transition-colors"
                  >
                    <option>North America</option>
                    <option>Europe</option>
                    <option>Asia</option>
                    <option>Australia</option>
                    <option>Mixed</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button 
                  onClick={handleFetchRecommendations}
                  className="px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-purple-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-accentPurple/25 transition-all"
                >
                  Generate Recommendations <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP: RECOMMENDATIONS */}
          {step === "RECOMMENDATIONS" && (
            <div className="animate-fade-in flex flex-col h-full">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Recommended Hosts</h3>
                  <p className="text-xs text-slate-400 mt-1">Based on your server footprint and preferences.</p>
                </div>
                <button onClick={() => setStep("PREFERENCES")} className="text-xs text-accentPurple hover:text-purple-400 flex items-center gap-1 font-bold">
                  <Settings className="w-3 h-3" /> Edit Preferences
                </button>
              </div>

              <ProviderMatrix 
                recommendations={recommendations} 
                selectedProviderId={selectedProviderId}
                onSelect={(pid, planId) => {
                  setSelectedProviderId(pid);
                  setSelectedPlanId(planId);
                }} 
              />

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-end">
                <button 
                  onClick={handleSetupMigration}
                  disabled={!selectedProviderId}
                  className="px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-purple-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-accentPurple/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Set Up Migration <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP: TRANSFER */}
          {step === "TRANSFER" && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Sync with {selectedProviderName}</h3>
                <button onClick={() => setStep("READINESS")} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-bold">
                  Back
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-4 bg-slate-900/50 p-3 rounded-lg border border-white/5">
                Sync selected files over SFTP — you'll pick which files (defaulting to your world saves) after choosing a direction. Retrieve your SFTP host, port, username, and password from {selectedProviderName}'s control panel.
              </p>

              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-300">SFTP Host
                  <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-accentPurple px-3 py-2 text-sm text-white outline-none transition-colors" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="e.g. sftp.host.com" />
                </label>
                <div className="flex gap-3">
                  <label className="block text-xs font-medium text-slate-300 w-24">Port
                    <input type="number" className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-accentPurple px-3 py-2 text-sm text-white outline-none transition-colors" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 22 })} />
                  </label>
                  <label className="block text-xs font-medium text-slate-300 flex-1">Username
                    <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-accentPurple px-3 py-2 text-sm text-white outline-none transition-colors" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="username" />
                  </label>
                </div>
                <label className="block text-xs font-medium text-slate-300">Password {saved && <span className="text-slate-500">(leave blank to keep current)</span>}
                  <input type="password" className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-accentPurple px-3 py-2 text-sm text-white outline-none transition-colors" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" />
                </label>
                <label className="block text-xs font-medium text-slate-300">Remote base path
                  <input className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 focus:border-accentPurple px-3 py-2 text-sm text-white outline-none transition-colors" value={form.remoteBasePath} onChange={(e) => setForm({ ...form, remoteBasePath: e.target.value })} />
                </label>
                <div className="flex gap-2 mt-4">
                  <button onClick={saveLink} disabled={!!busy} className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white transition-colors">{busy === "save" ? "Saving..." : "Save connection"}</button>
                  <button onClick={testConn} disabled={!saved || !!busy} className="rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"><Plug className="w-4 h-4" /> Test</button>
                </div>
              </div>

              <div className="mt-6 border-t border-white/5 pt-4">
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300/80 mb-3">The files you select overwrite their counterparts on the destination. The local server is stopped automatically; stop the remote server before transferring.</div>
                <label className="flex items-center gap-2 text-xs text-slate-300 mb-4">
                  <input type="checkbox" checked={confirmStopped} onChange={(e) => setConfirmStopped(e.target.checked)} className="rounded bg-slate-900 border-slate-700 text-accentPurple focus:ring-accentPurple" />
                  I've stopped the remote server.
                </label>
                <div className="flex gap-2">
                  <button onClick={() => beginTransfer("PUSH")} disabled={!canTransfer} className="flex-1 rounded-xl bg-accentPurple hover:bg-purple-500 disabled:opacity-50 px-3 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-accentPurple/20">{busy === "PUSH" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />} Push to Cloud</button>
                  <button onClick={() => beginTransfer("PULL")} disabled={!canTransfer} className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 px-3 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-1.5 transition-colors">{busy === "PULL" ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />} Pull from Cloud</button>
                </div>

                {progress && (
                  <div className="mt-4">
                    <div className="text-xs text-slate-400 mb-1">{progress.label}</div>
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-accentPurple to-indigo-500 transition-all" style={{ width: progress.percent !== null ? `${progress.percent}%` : "40%" }} />
                    </div>
                  </div>
                )}

                {saved && (
                  <div className="mt-4 text-[10px] text-slate-500 flex gap-4">
                    {saved.lastPushAt && <div>Last push: {new Date(saved.lastPushAt).toLocaleString()}</div>}
                    {saved.lastPullAt && <div>Last pull: {new Date(saved.lastPullAt).toLocaleString()}</div>}
                  </div>
                )}
              </div>

              {message && <div className="mt-4 text-sm text-white bg-slate-800/80 rounded-lg px-4 py-3 border border-white/5">{message}</div>}

              {picker && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="w-full max-w-lg rounded-2xl bg-slate-950 border border-white/10 p-5 shadow-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-white">Select files to {picker.direction === "PUSH" ? "upload" : "download"}</h4>
                      <span className="text-[10px] text-slate-500">{picker.checked.length} selected</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">Defaults to your world-save files. Check folders to include everything inside them.</p>
                    <FilePickerTree
                      entries={picker.tree}
                      checked={picker.checked}
                      onChange={(next) => setPicker((p) => (p ? { ...p, checked: next } : p))}
                    />
                    {pickerError && <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{pickerError}</div>}
                    {picker.checked.length === 0 && <p className="text-xs text-amber-300/80 mt-3">Select at least one file to continue.</p>}
                    <div className="flex gap-2 mt-4 justify-end">
                      <button onClick={() => { setPicker(null); setBusy(null); setPickerError(null); }} className="rounded-lg border border-slate-700 hover:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">Back</button>
                      <button onClick={confirmPicker} disabled={picker.checked.length === 0 || !!busy} className="rounded-lg bg-accentPurple hover:bg-purple-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white">Continue</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
