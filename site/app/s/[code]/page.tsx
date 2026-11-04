import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, Download, Users } from "lucide-react";

import { getHostedStatus } from "@/lib/backend/status";
import { DOWNLOAD_URL } from "@/lib/constants";

// Always render live data — the snapshot changes every few minutes while the
// host plays, and the whole point of this page is "is it up right now?".
export const dynamic = "force-dynamic";

type StatusPageProps = {
  params: { code: string };
};

// When the host PC goes off (or the relay stops reporting), a stored "RUNNING"
// goes stale — past this age the page says so instead of trusting the snapshot.
const FRESH_WINDOW_MS = 15 * 60_000;

function gameLabel(game: string): string {
  const labels: Record<string, string> = {
    MINECRAFT: "Minecraft",
    VALHEIM: "Valheim",
    ENSHROUDED: "Enshrouded",
    ZOMBOID: "Project Zomboid",
    ARK: "ARK: Survival Evolved",
    TERRARIA: "Terraria",
    PALWORLD: "Palworld",
    RUST: "Rust",
    SATISFACTORY: "Satisfactory",
    VRISING: "V Rising",
    WINDROSE: "Windrose",
  };
  return labels[game.toUpperCase()] ?? game;
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export async function generateMetadata({ params }: StatusPageProps): Promise<Metadata> {
  const status = await getHostedStatus(params.code);
  if (!status) return { title: "Server status | RealmSwap" };
  const online = status.status === "RUNNING";
  return {
    title: `${status.name} — ${online ? "Online" : "Offline"} | RealmSwap`,
    description: `Live status for the ${gameLabel(status.game)} server "${status.name}".`,
  };
}

export default async function HostedStatusPage({ params }: StatusPageProps) {
  const status = await getHostedStatus(params.code);
  if (!status) notFound();

  const age = Date.now() - new Date(status.updated_at).getTime();
  const isRunning = status.status === "RUNNING";
  const fresh = age < FRESH_WINDOW_MS;
  const online = isRunning && fresh;
  const stale = isRunning && !fresh;

  const pill = online
    ? { label: "Online", classes: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" }
    : stale
      ? { label: "Host not reporting", classes: "bg-amber-500/10 border-amber-500/30 text-amber-400" }
      : { label: "Offline", classes: "bg-slate-500/10 border-slate-500/30 text-slate-400" };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-card p-8 shadow-2xl text-center">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-4">
            RealmSwap server status
          </p>
          <h1 className="text-2xl font-extrabold text-white break-words">{status.name}</h1>
          <p className="text-sm text-slate-400 mt-1">{gameLabel(status.game)}</p>

          <div
            className={`inline-flex items-center gap-2 mt-6 px-4 py-1.5 rounded-full border text-xs font-extrabold ${pill.classes}`}
          >
            <Activity className="w-3.5 h-3.5" />
            {pill.label}
          </div>

          {online && (
            <div className="mt-6 flex items-center justify-center gap-2 text-slate-300 text-sm">
              <Users className="w-4 h-4 text-slate-500" />
              <span>
                {status.players != null
                  ? `${status.players}${status.maxplayers != null ? ` / ${status.maxplayers}` : ""} playing now`
                  : "Running — the game isn't reporting a player count"}
              </span>
            </div>
          )}

          <p className="text-[11px] text-slate-500 mt-6">
            Last updated {ago(status.updated_at)}
            {stale && " — the host's PC is probably off. Check back before game night."}
          </p>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            href={DOWNLOAD_URL}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurpleHover text-white font-bold text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Run your own free server
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft className="w-3 h-3" />
            About RealmSwap
          </Link>
        </div>
      </div>
    </main>
  );
}
