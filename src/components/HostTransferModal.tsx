"use client";
import { useEffect, useState } from "react";
import { X, UploadCloud, DownloadCloud, Plug, Loader2 } from "lucide-react";

interface Props {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

interface LinkState {
  provider: string;
  host: string;
  port: number;
  username: string;
  remoteBasePath: string;
  excludeConfig: boolean;
  lastPushAt?: string | null;
  lastPullAt?: string | null;
  lastError?: string | null;
}

export default function HostTransferModal({ serverId, serverName, onClose }: Props) {
  const [form, setForm] = useState({ host: "", port: 22, username: "", password: "", remoteBasePath: ".", excludeConfig: false });
  const [saved, setSaved] = useState<LinkState | null>(null);
  const [confirmStopped, setConfirmStopped] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ percent: number | null; label: string } | null>(null);

  const loadLink = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/host-link`);
      const body = await res.json();
      if (body.link) {
        setSaved(body.link);
        setForm((f) => ({ ...f, host: body.link.host, port: body.link.port, username: body.link.username, remoteBasePath: body.link.remoteBasePath, excludeConfig: body.link.excludeConfig, password: "" }));
      }
    } catch {
      setMessage("Failed to load saved connection.");
    }
  };

  useEffect(() => { loadLink(); }, [serverId]);

  const saveLink = async () => {
    setBusy("save"); setMessage(null);
    const res = await fetch(`/api/servers/${serverId}/host-link`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) { setMessage(body.error || "Save failed"); return; }
    setMessage("Connection saved.");
    await loadLink();
  };

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
    const interval = setInterval(pollProgress, 1000);
    try {
      const res = await fetch(`/api/servers/${serverId}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction, confirmRemoteStopped: confirmStopped }) });
      const body = await res.json();
      if (!res.ok) setMessage(body.error || "Transfer failed");
      else {
        const s = body.summary;
        setMessage(`${direction === "PUSH" ? "Pushed" : "Pulled"} ${s?.filesTransferred ?? 0} file(s), ${((s?.bytesTransferred ?? 0) / 1048576).toFixed(1)} MB.${s?.failures?.length ? ` ${s.failures.length} failed.` : ""}`);
      }
    } finally {
      clearInterval(interval); setBusy(null); setProgress(null); await loadLink();
    }
  };

  const canTransfer = saved && confirmStopped && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Transfer "{serverName}" to a host</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-slate-400 mb-4">Full-server mirror over SFTP. In Akliz Command Center, open your server &rarr; Manage &rarr; "Show SFTP Information" for the host and username. The password is your Command Center login.</p>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-300">SFTP Host
            <input className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="bos-sr-1-1-1.akliz.net" />
          </label>
          <div className="flex gap-3">
            <label className="block text-xs font-medium text-slate-300 w-24">Port
              <input type="number" className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 22 })} />
            </label>
            <label className="block text-xs font-medium text-slate-300 flex-1">Username
              <input className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="you@email.com.123" />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-300">Password {saved && <span className="text-slate-500">(leave blank to keep current)</span>}
            <input type="password" className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Command Center password" />
          </label>
          <label className="block text-xs font-medium text-slate-300">Remote base path
            <input className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" value={form.remoteBasePath} onChange={(e) => setForm({ ...form, remoteBasePath: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={form.excludeConfig} onChange={(e) => setForm({ ...form, excludeConfig: e.target.checked })} />
            Don't overwrite host config (skip server.properties)
          </label>

          <div className="flex gap-2">
            <button onClick={saveLink} disabled={!!busy} className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white">{busy === "save" ? "Saving..." : "Save connection"}</button>
            <button onClick={testConn} disabled={!saved || !!busy} className="rounded-lg border border-slate-600 hover:bg-slate-800 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-slate-200 flex items-center gap-1.5"><Plug className="w-4 h-4" /> Test</button>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-700 pt-4">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300 mb-3">A full mirror overwrites files on the destination. The local server is stopped automatically; stop the Akliz server in Command Center before transferring.</div>
          <label className="flex items-center gap-2 text-xs text-slate-300 mb-3">
            <input type="checkbox" checked={confirmStopped} onChange={(e) => setConfirmStopped(e.target.checked)} />
            I've stopped the server in Akliz Command Center.
          </label>
          <div className="flex gap-2">
            <button onClick={() => transfer("PUSH")} disabled={!canTransfer} className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white flex items-center justify-center gap-1.5">{busy === "PUSH" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />} Push to Akliz</button>
            <button onClick={() => transfer("PULL")} disabled={!canTransfer} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold text-white flex items-center justify-center gap-1.5">{busy === "PULL" ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />} Pull from Akliz</button>
          </div>

          {progress && (
            <div className="mt-3">
              <div className="text-xs text-slate-400 mb-1">{progress.label}</div>
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all" style={{ width: progress.percent !== null ? `${progress.percent}%` : "40%" }} />
              </div>
            </div>
          )}

          {saved && (
            <div className="mt-3 text-xs text-slate-500">
              {saved.lastPushAt && <div>Last push: {new Date(saved.lastPushAt).toLocaleString()}</div>}
              {saved.lastPullAt && <div>Last pull: {new Date(saved.lastPullAt).toLocaleString()}</div>}
              {saved.lastError && <div className="text-red-400">Last error: {saved.lastError}</div>}
            </div>
          )}
        </div>

        {message && <div className="mt-4 text-sm text-slate-200 bg-slate-800 rounded-lg px-3 py-2">{message}</div>}
      </div>
    </div>
  );
}
