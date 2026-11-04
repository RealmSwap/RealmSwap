"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Play, Puzzle, QrCode, Sparkles, Users, X } from "lucide-react";

interface ChecklistStep {
  key: string;
  done: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: { label: string; onClick?: () => void; href?: string };
}

/**
 * The dashboard's "get your first friend online" path, shown while the user's
 * only server hasn't had a friend join yet. Four steps, all self-verifying:
 * booted once, mods installed, an invite minted, and the real finish line —
 * a non-zero player count in the server's telemetry. Dismissal and completion
 * persist per server in localStorage, mirroring the first-boot celebration
 * guards; the parent reads those and stops rendering the card.
 */
export function FirstFriendChecklist({
  server,
  onOpenJoinInfo,
  onStart,
  onDismiss,
  onFriendJoined,
}: {
  server: any;
  onOpenJoinInfo: () => void;
  onStart: () => void;
  onDismiss: () => void;
  onFriendJoined: () => void;
}) {
  const serverId = server.id;
  const [modsCount, setModsCount] = useState<number | null>(null);
  const [friendIn, setFriendIn] = useState(false);
  const friendNotifiedRef = useRef(false);

  const booted = !!server.firstOnlineAt || server.status === "RUNNING";
  const hasInvite = !!server.inviteCode;

  // Mods and player telemetry are the two signals the dashboard doesn't
  // already hold — poll them lightly while the story is unfinished. The
  // players route server-side-caches the live query (20s), so this can't
  // hammer the game server.
  useEffect(() => {
    if (booted && hasInvite && friendIn && (modsCount ?? 0) > 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [modsRes, playersRes] = await Promise.all([
          fetch(`/api/servers/${serverId}/mods`),
          fetch(`/api/servers/${serverId}/players`),
        ]);
        if (cancelled) return;
        if (modsRes.ok) {
          const d = await modsRes.json();
          setModsCount(Array.isArray(d.mods) ? d.mods.length : null);
        }
        if (playersRes.ok) {
          const d = await playersRes.json();
          const seen =
            (d.current ?? 0) > 0 ||
            (Array.isArray(d.history) && d.history.some((p: any) => (p.n ?? 0) > 0));
          setFriendIn(seen);
        }
      } catch {}
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverId, booted, hasInvite, friendIn, modsCount]);

  // The payoff moment fires exactly once — the parent stores completion and
  // toasts; the card stays visible in its finished state until the next
  // dashboard poll hides it.
  useEffect(() => {
    if (friendIn && !friendNotifiedRef.current) {
      friendNotifiedRef.current = true;
      onFriendJoined();
    }
  }, [friendIn, onFriendJoined]);

  const steps: ChecklistStep[] = [
    {
      key: "boot",
      done: booted,
      icon: <Play className="w-4 h-4" />,
      title: "Boot the server once",
      hint: booted
        ? "It's been online — the world is waiting."
        : "Press Start on the card above — the first boot downloads the game files for you.",
      action: booted ? undefined : { label: "Start", onClick: onStart },
    },
    {
      key: "mods",
      done: (modsCount ?? 0) > 0,
      icon: <Puzzle className="w-4 h-4" />,
      title: "Add your first mods",
      hint:
        (modsCount ?? 0) > 0
          ? `${modsCount} mod${modsCount === 1 ? "" : "s"} installed.`
          : "Optional — search Modrinth, CurseForge, Thunderstore or Steam Workshop and install in one click.",
      action:
        (modsCount ?? 0) > 0
          ? undefined
          : { label: "Open Mods", href: `/dashboard/mods?server=${serverId}` },
    },
    {
      key: "invite",
      done: hasInvite,
      icon: <QrCode className="w-4 h-4" />,
      title: "Share Join Info",
      hint: hasInvite
        ? "Invite minted — friends scan or click to auto-install every mod and join."
        : "One link or QR: your friend's client gets every mod and config it needs.",
      action: hasInvite ? undefined : { label: "Open Join Info", onClick: onOpenJoinInfo },
    },
    {
      key: "friend",
      done: friendIn,
      icon: <Users className="w-4 h-4" />,
      title: "First friend joins",
      hint: friendIn
        ? "Someone's in — game night is real."
        : "We watch the player count for you and check this off automatically.",
    },
  ];

  return (
    <section className="relative w-full p-5 rounded-2xl bg-slate-900/60 border border-accentPurple/20">
      <button
        onClick={onDismiss}
        title="Dismiss this checklist"
        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-accentPurple" />
        <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
          Get your first friend online
        </h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Four steps between you and game night — RealmSwap handles the rest.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
              step.done
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-slate-950/40 border-white/5"
            }`}
          >
            <div
              className={`p-2 rounded-lg flex-shrink-0 ${
                step.done ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-slate-400"
              }`}
            >
              {step.done ? <Check className="w-4 h-4" /> : step.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-bold ${step.done ? "text-emerald-400" : "text-white"}`}>
                {step.title}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{step.hint}</div>
              {step.action && (
                <div className="mt-2">
                  {step.action.href ? (
                    <Link
                      href={step.action.href}
                      className="inline-flex px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-slate-200 transition-colors"
                    >
                      {step.action.label}
                    </Link>
                  ) : (
                    <button
                      onClick={step.action.onClick}
                      className="inline-flex px-3 py-1.5 rounded-lg bg-accentPurple hover:bg-accentPurple/90 text-[11px] font-bold text-white transition-colors"
                    >
                      {step.action.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
