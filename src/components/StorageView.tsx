"use client";

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

export default function StorageView({ user }: { user: any }) {
  const { addToast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
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

  return (
    <div className="flex min-h-screen bg-[#06070b] text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col hidden md:flex">
        <div className="p-6 border-b border-borderDark flex items-center gap-2">
          <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
        </div>
        <nav className="p-4 space-y-1">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
            <LayoutDashboard className="w-4 h-4 text-mutedText group-hover:text-white" />
            <span>Dashboard</span>
          </Link>
          <Link href="/dashboard/servers/new" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
            <Plus className="w-4 h-4 text-mutedText group-hover:text-white" />
            <span>Create Server</span>
          </Link>
          <Link href="/dashboard/marketplace" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group">
            <Store className="w-4 h-4 text-mutedText group-hover:text-white" />
            <span>Marketplace</span>
          </Link>
          <div className="pt-4 pb-2 px-3">
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider">Features</span>
          </div>
          {DASHBOARD_NAV_LINKS.map((link, i) => {
            const active = link.href === "/dashboard/storage";
            return (
              <Link
                key={i}
                href={link.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all group ${
                  active
                    ? "bg-accentPurple/10 text-white border border-accentPurple/20"
                    : "hover:bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <link.icon className={`w-4 h-4 ${active ? "text-accentPurple" : "text-slate-500 group-hover:text-white"} transition-colors`} />
                  <span>{link.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-2">
          <HardDrive className="w-6 h-6 text-accentPurple" />
          <h1 className="text-2xl font-bold">File Locations</h1>
        </div>
        <p className="text-sm text-mutedText mb-6 leading-relaxed max-w-2xl">
          All your servers, worlds, and backups live in this folder. If the app ever stops
          working, your data is safe here — copy this folder to back it up, or move it to
          another machine to keep hosting your games.
        </p>

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
