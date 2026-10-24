"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Plus,
  Store,
  HardDrive,
  Copy,
  Check,
  FolderOpen,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";
import { useToast } from "@/components/ToastProvider";

interface Location {
  key: string;
  label: string;
  path: string;
  exists: boolean;
}

interface ServerStorage {
  id: string;
  name: string;
  game: string;
  status: string;
  folderGB: number | null;
  worldsGB: number | null;
  modsGB: number | null;
  logsGB: number | null;
  otherGB: number | null;
  backupsGB: number;
  snapshotsGB: number | null;
  growth7dGB: number | null;
}

interface StorageData {
  servers: ServerStorage[];
  totals: { freeGB: number | null; archivesGB: number | null };
}

const gb = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(v < 10 ? 2 : 1)} GB`);

export default function StorageView({ user }: { user: any }) {
  const { addToast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [storage, setStorage] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system/storage")
      .then((r) => r.json())
      .then((d) => {
        setLocations(d.locations || []);
      })
      .catch(() => addToast("error", "Could not load file locations"))
      .finally(() => setLoading(false));
    fetch("/api/storage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setStorage(d); })
      .catch(() => addToast("error", "Could not load storage usage"));
  }, [addToast]);

  const handleCopy = (loc: Location) => {
    navigator.clipboard.writeText(loc.path);
    setCopiedKey(loc.key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpen = async (loc: Location) => {
    try {
      const res = await fetch("/api/system/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: loc.key }),
      });
      const data = await res.json();
      if (!data.ok) addToast("error", data.error || "Could not open folder");
    } catch {
      addToast("error", "Could not open folder");
    }
  };

  const servers = storage?.servers ?? [];
  const realmUsedGB =
    servers.reduce((sum, s) => sum + (s.folderGB ?? 0) + s.backupsGB + (s.snapshotsGB ?? 0), 0) +
    (storage?.totals.archivesGB ?? 0);
  const freeGB = storage?.totals.freeGB ?? null;

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      {/* Sidebar */}
      <SidebarNavigation user={user} />

      {/* Main */}
      <main className="flex-1 p-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-2">
          <HardDrive className="w-6 h-6 text-accentPurple" />
          <h1 className="text-2xl font-bold">Storage</h1>
        </div>
        <p className="text-sm text-mutedText mb-6 leading-relaxed max-w-2xl">
          All your servers, worlds, and backups live in this folder. If the app ever stops
          working, your data is safe here — copy this folder to back it up, or move it to
          another machine to keep hosting your games.
        </p>

        {/* Where the disk is going */}
        {storage && (
          <section className="mb-8">
            <h2 className="text-lg font-bold text-white mb-1">Where your disk is going</h2>
            <p className="text-xs text-mutedText mb-4">
              {freeGB != null ? (
                <>
                  <span className="text-slate-300 font-bold">{freeGB.toFixed(1)} GB</span> free on this drive ·
                  {" "}<span className="text-slate-300 font-bold">{realmUsedGB.toFixed(1)} GB</span> used by RealmSwap
                </>
              ) : (
                <>
                  <span className="text-slate-300 font-bold">{realmUsedGB.toFixed(1)} GB</span> used by RealmSwap
                </>
              )}
              {" · "}worlds, mods, and logs per server below
            </p>

            {servers.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 text-sm text-mutedText">
                Deploy a server and its disk usage will show up here.
              </div>
            ) : (
              <div className="space-y-3">
                {servers.map((s) => {
                  const total = s.folderGB ?? 0;
                  const seg = (v: number | null) => (total > 0 && v != null ? (v / total) * 100 : 0);
                  const growth = s.growth7dGB;
                  return (
                    <div key={s.id} className="p-4 rounded-xl bg-slate-900/40 border border-white/5">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="min-w-0">
                          <span className="text-sm font-bold truncate">{s.name}</span>
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{s.game}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          {growth != null && growth !== 0 && (
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                growth > 0
                                  ? "bg-amber-500/10 border-amber-500/25 text-amber-400"
                                  : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                              }`}
                              title="Change in the server folder size over the last 7 days"
                            >
                              {growth > 0 ? "+" : "−"}
                              {Math.abs(growth).toFixed(2)} GB / 7d
                            </span>
                          )}
                          <span className="font-bold text-white">{gb(s.folderGB)}</span>
                        </div>
                      </div>

                      {s.folderGB == null ? (
                        <div className="text-xs text-mutedText">No local install folder on this machine.</div>
                      ) : (
                        <>
                          {/* Stacked worlds / mods / logs / other bar */}
                          <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-800" title="Folder usage by kind">
                            <div className="bg-emerald-500" style={{ width: `${seg(s.worldsGB)}%` }} title={`Worlds: ${gb(s.worldsGB)}`} />
                            <div className="bg-violet-500" style={{ width: `${seg(s.modsGB)}%` }} title={`Mods: ${gb(s.modsGB)}`} />
                            <div className="bg-amber-500" style={{ width: `${seg(s.logsGB)}%` }} title={`Logs: ${gb(s.logsGB)}`} />
                            <div className="bg-slate-600" style={{ width: `${seg(s.otherGB)}%` }} title={`Game files & other: ${gb(s.otherGB)}`} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mutedText">
                            <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />Worlds {gb(s.worldsGB)}</span>
                            <span><span className="inline-block w-2 h-2 rounded-sm bg-violet-500 mr-1" />Mods {gb(s.modsGB)}</span>
                            <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-500 mr-1" />Logs {gb(s.logsGB)}</span>
                            <span><span className="inline-block w-2 h-2 rounded-sm bg-slate-600 mr-1" />Game &amp; other {gb(s.otherGB)}</span>
                            <span>Backups {gb(s.backupsGB)}</span>
                            {s.snapshotsGB != null && s.snapshotsGB > 0 && <span>Snapshots {gb(s.snapshotsGB)}</span>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* File locations */}
        <h2 className="text-lg font-bold text-white mb-3">File locations</h2>
        {loading ? (
          <div className="text-mutedText text-sm">Loading…</div>
        ) : (
          <div className="space-y-3">
            {locations.map((loc) => (
              <div
                key={loc.key}
                className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/40 border border-white/5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold">{loc.label}</div>
                  <div className="text-xs text-mutedText font-mono truncate">{loc.path}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(loc)}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-white/5 hover:border-accentPurple/40 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                    title="Copy path"
                  >
                    {copiedKey === loc.key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === loc.key ? "Copied" : "Copy"}</span>
                  </button>
                  <button
                    onClick={() => handleOpen(loc)}
                    disabled={!loc.exists}
                    title={loc.exists ? "Open in file manager" : "Created the first time it's used"}
                    className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                      loc.exists
                        ? "bg-accentPurple/10 border border-accentPurple/20 text-accentPurple hover:bg-accentPurple/20"
                        : "bg-slate-800/40 border border-white/5 text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open</span>
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
