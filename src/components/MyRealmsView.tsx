"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Download, ThumbsUp, ThumbsDown, ShieldCheck, Store, TrendingUp } from "lucide-react";

type Daily = { day: string; downloads: number };
type RealmAnalytics = {
  id: string;
  name: string;
  game_slug: string | null;
  status: string;
  visibility: string;
  verified_level: string;
  total_downloads: number;
  like_count: number;
  dislike_count: number;
  created_at: string;
  downloads_in_window: number;
  daily: Daily[];
};

// Build a dense last-N-days series (zero-filled) from the sparse daily buckets.
function densify(daily: Daily[], days = 30): number[] {
  const map = new Map((daily || []).map((d) => [d.day, d.downloads]));
  const out: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(map.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  return out;
}

function Sparkline({ series }: { series: number[] }) {
  const w = 160;
  const h = 36;
  const max = Math.max(1, ...series);
  const step = series.length > 1 ? w / (series.length - 1) : w;
  const pts = series.map((v, i) => [i * step, h - (v / max) * (h - 4) - 2]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const flat = series.every((v) => v === 0);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {!flat && <polygon points={area} className="fill-accentPurple/10" />}
      <polyline
        points={line}
        fill="none"
        className={flat ? "stroke-white/15" : "stroke-accentPurple"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusBadge({ status, verified }: { status: string; verified: string }) {
  const color =
    status === "PUBLISHED" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
    : status === "DRAFT" ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
    : "text-slate-400 border-white/10 bg-white/5";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${color}`}>{status}</span>
      {verified === "OFFICIAL" && <span title="Official"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /></span>}
      {verified === "VERIFIED" && <span title="Verified"><ShieldCheck className="w-3.5 h-3.5 text-accentBlue" /></span>}
    </span>
  );
}

export default function MyRealmsView({ realms }: { realms: RealmAnalytics[] }) {
  return (
    <div className="min-h-screen bg-background text-slate-100 px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/dashboard/marketplace" className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors mb-6">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Marketplace</span>
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <Store className="w-6 h-6 text-accentPurple" />
            <span>My Realms</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Realms you've published, with download analytics from the last 30 days.</p>
        </div>

        {realms.length === 0 ? (
          <div className="p-8 rounded-2xl border border-white/5 bg-slate-950/40 text-center">
            <p className="text-sm text-mutedText">You haven't published any realms yet.</p>
            <Link href="/dashboard/marketplace" className="inline-block mt-3 text-sm font-bold text-accentPurple hover:text-accentPurpleHover">
              Browse the marketplace →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {realms.map((r) => (
              <div key={r.id} className="glass-panel rounded-2xl border border-white/5 p-5 flex flex-wrap items-center gap-6">
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-white truncate">{r.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-mutedText">
                    <span>{r.game_slug}</span>
                    <span>·</span>
                    <StatusBadge status={r.status} verified={r.verified_level} />
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="flex items-center gap-1.5 text-white font-bold"><Download className="w-4 h-4 text-accentPurple" />{r.total_downloads}</div>
                    <div className="text-[10px] text-mutedText uppercase tracking-wider">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1.5 text-white font-bold"><TrendingUp className="w-4 h-4 text-emerald-400" />{r.downloads_in_window}</div>
                    <div className="text-[10px] text-mutedText uppercase tracking-wider">30 days</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1.5 text-white font-bold">
                      <ThumbsUp className="w-3.5 h-3.5 text-slate-400" />{r.like_count}
                      <ThumbsDown className="w-3.5 h-3.5 text-slate-400 ml-1" />{r.dislike_count}
                    </div>
                    <div className="text-[10px] text-mutedText uppercase tracking-wider">Votes</div>
                  </div>
                </div>

                <div className="ml-auto">
                  <Sparkline series={densify(r.daily, 30)} />
                  <div className="text-[10px] text-mutedText text-right mt-0.5">30-day downloads</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
