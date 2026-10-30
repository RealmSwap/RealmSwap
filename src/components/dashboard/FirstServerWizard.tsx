"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Rocket,
  Sparkles,
  QrCode,
  CloudUpload,
  CalendarClock,
  ExternalLink
} from "lucide-react";

/**
 * First-run deploy wizard, shown on the dashboard when the user has no
 * servers: pick a game → name it → deploy → make it yours. Deliberately
 * minimal — defaults everywhere, tuning happens later. Uses the same
 * POST /api/servers the full create form uses.
 *
 * Step 3 stays mounted after the deploy (the parent holds the wizard open
 * until Finish) and walks the new owner through the three things a fresh
 * server historically never heard about: the automated playit tunnel claim,
 * offsite S3 backups, and a snapshot schedule.
 */
export function FirstServerWizard({
  onDeployed,
  onDone,
  onOpenConnection
}: {
  onDeployed: (server: any) => void;
  onDone: () => void;
  onOpenConnection: (server: any) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [ram, setRam] = useState(4);
  const [password, setPassword] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployed, setDeployed] = useState<any | null>(null);
  const [dockerAvailable, setDockerAvailable] = useState(false);

  // Step-3 option state
  const [s3, setS3] = useState<{ configured: boolean; bucket?: string | null; admin: boolean } | null>(null);
  const [snapshotsOn, setSnapshotsOn] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  useEffect(() => {
    // A failed game-list load must not look like an empty catalog — without
    // the r.ok check a server error silently rendered an empty grid.
    fetch("/api/definitions")
      .then(async (r) => {
        if (!r.ok) throw new Error(`definitions request failed (${r.status})`);
        const d = await r.json();
        const list = d.definitions || [];
        setDefinitions(list);
        if (list.length === 0) setError("No games are available yet — import a game definition or ask the server owner to.");
      })
      .catch(() => setError("Couldn't load the game list — the app may still be starting. Reopen this page in a moment."))
      .finally(() => setLoading(false));
    // Headless deployments (NAS/mini PC) have no local-machine runner — when a
    // Docker daemon is reachable, deploys default to the container runtime.
    // The create route still validates the game has a container plan and
    // falls back with a clear error otherwise, so this is safe to send.
    fetch("/api/system/docker-status")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => setDockerAvailable(!!d.available))
      .catch(() => setDockerAvailable(false));
  }, []);

  // Offsite status is admin-only; a non-admin teammate just gets the link
  // without the configured/not-configured state.
  useEffect(() => {
    if (step !== 3) return;
    fetch("/api/user/s3-settings")
      .then((r) => (r.ok ? r.json() : { configured: false, admin: false }))
      .then((d) => setS3({ configured: !!d.configured, bucket: d.bucket ?? null, admin: d.admin !== false }))
      .catch(() => setS3({ configured: false, bucket: null, admin: false }));
  }, [step]);

  const pick = (def: any) => {
    setPicked(def);
    setName(`${def.displayName} Server`);
    setRam(def.recommendedRamGB || 4);
    setStep(2);
  };

  const deploy = async () => {
    if (!picked) return;
    setDeploying(true);
    setError(null);
    try {
      // Container plan means the game can run under the Docker runtime; only
      // then pass runnerType — LOCAL remains the default on desktop machines.
      const hasContainerPlan = !!picked?.spec?.container;
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          definitionId: picked.id,
          ramAllocation: ram,
          password: password || undefined,
          paramValues: {},
          runnerType: dockerAvailable && hasContainerPlan ? "DOCKER" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deployment failed");
      setDeployed(data);
      setStep(3);
      onDeployed(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeploying(false);
    }
  };

  const enableNightlySnapshots = async () => {
    if (!deployed) return;
    setSnapshotBusy(true);
    try {
      const res = await fetch(`/api/servers/${deployed.id}/backups/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotInterval: "24" }),
      });
      if (res.ok) {
        setSnapshotsOn(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not enable snapshots — set them on the Backups page.");
      }
    } catch {
      setError("Could not enable snapshots — set them on the Backups page.");
    } finally {
      setSnapshotBusy(false);
    }
  };

  return (
    <div className="col-span-full py-10 px-6 flex flex-col items-center border border-accentPurple/20 rounded-[18px] bg-gradient-to-b from-accentPurple/5 to-slate-900/20">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-accentPurple" />
        <span className="text-[10px] font-extrabold text-accentPurple uppercase tracking-widest">Welcome to RealmSwap</span>
      </div>
      <h3 className="font-extrabold text-xl text-white mb-1">Deploy your first server</h3>
      <p className="text-slate-400 text-sm mb-6 text-center max-w-md">
        Three quick steps. RealmSwap downloads and configures everything — you just pick a game.
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 text-[11px] font-bold">
        {["Pick Game", "Name It", "Make It Yours"].map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span className="w-8 h-px bg-white/10" />}
            <span className={`flex items-center gap-1.5 ${step === i + 1 ? "text-white" : step > i + 1 ? "text-emerald-400" : "text-slate-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === i + 1 ? "bg-accentPurple text-white" : step > i + 1 ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800"}`}>
                {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              {label}
            </span>
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold max-w-lg text-center">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="w-full max-w-3xl">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-accentPurple animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {definitions.map((def) => (
                <button
                  key={def.id}
                  onClick={() => pick(def)}
                  className="group text-left p-4 rounded-xl bg-slate-900/60 border border-white/5 hover:border-accentPurple/40 hover:bg-slate-900 transition-all"
                >
                  <div className="text-2xl mb-2">{def.icon || "🎮"}</div>
                  <div className="font-bold text-sm text-white group-hover:text-accentPurple transition-colors">{def.displayName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{def.description}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5 font-mono">{def.recommendedRamGB} GB RAM</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && picked && (
        <div className="w-full max-w-md space-y-5">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Server name</label>
            <input
              type="text"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:border-accentPurple focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              RAM allocation — <span className="text-accentPurple font-mono">{ram} GB</span>
            </label>
            <input
              type="range"
              min={2}
              max={32}
              step={1}
              value={ram}
              onChange={(e) => setRam(Number(e.target.value))}
              className="w-full accent-accentPurple"
            />
            <p className="text-[10px] text-slate-500 mt-1">{picked.displayName} recommends {picked.recommendedRamGB} GB.</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Password <span className="text-slate-600 normal-case font-medium">(optional — keeps randoms out)</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave empty for an open server"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:border-accentPurple focus:outline-none"
            />
          </div>
          {/* Say the quiet part up front: the first Start downloads the game
              files (and Java, for Minecraft-family games) — minutes, not
              seconds. Learning this at the moment of pressing Start feels
              like the app hanging. */}
          {(picked.installMethod === "STEAMCMD" || picked.spec?.requiresJava || picked.spec?.install?.url) && (
            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2">
              ℹ️ Heads up: the first start downloads the game server files
              {picked.spec?.requiresJava ? " and the right Java runtime" : ""} automatically — that's a one-time
              multi-minute download, and progress shows right on the server card.
            </p>
          )}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm font-bold transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={deploy}
              disabled={deploying || !name.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurple/90 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-accentPurple/25"
            >
              {deploying ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying…</> : <><Rocket className="w-4 h-4" /> Deploy Server</>}
            </button>
          </div>
        </div>
      )}

      {step === 3 && deployed && (
        <div className="w-full max-w-lg flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
            <Check className="w-7 h-7 text-emerald-400" />
          </div>
          <h4 className="font-extrabold text-white mb-1">{deployed.name} is ready</h4>
          <p className="text-sm text-slate-400 mb-6 text-center">
            Press Start on its card to boot it the first time — the game files download automatically.
            Three optional setup steps while you're here:
          </p>

          <div className="w-full space-y-3">
            {/* 1. Tunnel — opens Join Info, which drives the automated playit claim */}
            <div className="w-full p-4 rounded-xl bg-slate-900/60 border border-white/5 flex items-center gap-4">
              <div className="p-2 rounded-xl bg-accentPurple/10 text-accentPurple flex-shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">Friends outside your LAN?</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  RealmSwap can tunnel the server through playit.gg and claim it for you automatically.
                </div>
              </div>
              <button
                onClick={() => onOpenConnection(deployed)}
                className="flex-shrink-0 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-colors"
              >
                Open Join Info
              </button>
            </div>

            {/* 2. Offsite backups — status when checkable, link to the real panel */}
            <div className="w-full p-4 rounded-xl bg-slate-900/60 border border-white/5 flex items-center gap-4">
              <div className={`p-2 rounded-xl flex-shrink-0 ${s3?.configured ? "bg-emerald-500/10 text-emerald-400" : "bg-sky-500/10 text-sky-400"}`}>
                <CloudUpload className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">
                  Offsite backups {s3?.configured ? <span className="text-emerald-400">· on{s3.bucket ? ` → ${s3.bucket}` : ""}</span> : ""}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {s3?.configured
                    ? "Snapshots also copy to your own S3 bucket."
                    : "Copy snapshots to your own S3 bucket so a dead disk can't take the worlds with it."}
                </div>
              </div>
              {s3?.configured ? (
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <Link
                  href={`/dashboard/backups?server=${deployed.id}`}
                  className="flex-shrink-0 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1.5"
                >
                  Set up <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>

            {/* 3. Snapshot schedule — one click, same endpoint the Backups page uses */}
            <div className="w-full p-4 rounded-xl bg-slate-900/60 border border-white/5 flex items-center gap-4">
              <div className={`p-2 rounded-xl flex-shrink-0 ${snapshotsOn ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                <CalendarClock className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">
                  Nightly snapshots {snapshotsOn && <span className="text-emerald-400">· on</span>}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {snapshotsOn
                    ? "A snapshot every 24 hours — change it anytime on the Backups page."
                    : "Automatic world snapshot every 24 hours."}
                </div>
              </div>
              {snapshotsOn ? (
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <button
                  onClick={enableNightlySnapshots}
                  disabled={snapshotBusy}
                  className="flex-shrink-0 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-colors disabled:opacity-50"
                >
                  {snapshotBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Turn on"}
                </button>
              )}
            </div>
          </div>

          <button
            onClick={onDone}
            className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurple/90 text-white font-bold text-sm transition-all shadow-lg shadow-accentPurple/25"
          >
            Finish <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-[10px] text-slate-500 mt-2">Everything above is optional — skip any of it.</p>
        </div>
      )}
    </div>
  );
}
