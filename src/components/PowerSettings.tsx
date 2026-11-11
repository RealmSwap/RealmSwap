"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface PowerState {
  settings: { keepAwake: boolean; keepAwakeWhileRunning: boolean; wakeForSchedule: boolean };
  status: {
    desktop: boolean;
    keepingAwake: boolean;
    reasons: string[];
    nextStart: { serverName: string; label: string; source: "session" | "automation"; dueAt: string; wakeAt: string } | null;
    wakeRegisteredFor: string | null;
    wakeError: string | null;
    wakeTimers: { ac: string; dc: string } | null;
  };
}

type SettingKey = keyof PowerState["settings"];

// Turns "Allow wake timers" on for the active power plan while plugged in.
const ALLOW_WAKE_TIMERS = "powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 && powercfg /setactive SCHEME_CURRENT";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * The host PC's sleep, as far as RealmSwap is involved: holding it awake
 * while people play, and waking it ahead of scheduled starts. Shows what it
 * is doing right now and why, so neither "why is my PC still on?" nor "why
 * didn't it wake?" is a mystery.
 */
export function PowerSettings() {
  const [state, setState] = useState<PowerState | null>(null);
  const [saving, setSaving] = useState<SettingKey | null>(null);

  useEffect(() => {
    fetch("/api/system/power")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setState(data))
      .catch(() => {});
  }, []);

  const toggle = async (key: SettingKey) => {
    if (!state || saving) return;
    setSaving(key);
    try {
      const res = await fetch("/api/system/power", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: !state.settings[key] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save the power setting.");
      setState(data);
    } catch (err: any) {
      toast.error(err?.message || "Could not save the power setting.");
    } finally {
      setSaving(null);
    }
  };

  if (!state) return null;
  const { settings, status } = state;

  const Switch = ({ field, label }: { field: SettingKey; label: string }) => (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        className="sr-only peer"
        aria-label={label}
        checked={settings[field]}
        disabled={saving !== null}
        onChange={() => toggle(field)}
      />
      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
    </label>
  );

  const wakeTimersBlocked = status.wakeTimers !== null && status.wakeTimers.ac !== "enabled" && status.wakeTimers.ac !== "unknown";

  return (
    <>
      <div className="p-4 bg-slate-900 border border-white/5 rounded-lg mt-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200">Keep this PC awake while people are playing</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Windows treats a PC nobody is typing on as idle, even with friends on your server, and puts it to sleep
              under them. RealmSwap holds it awake while players are online (or when it can&rsquo;t tell) and around
              scheduled starts. The display can still turn off.
            </p>
          </div>
          <Switch field="keepAwake" label="Keep this PC awake while people are playing" />
        </div>

        {settings.keepAwake && (
          <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-white/5">
            <div>
              <h4 className="text-xs font-bold text-slate-300">Also whenever a server is running, even an empty one</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Off: the PC may sleep once a server is known to be empty. On: friends can join at any hour, and the PC
                stays on until you stop the server.
              </p>
            </div>
            <Switch field="keepAwakeWhileRunning" label="Also keep awake whenever a server is running" />
          </div>
        )}

        <p className="text-xs mt-4 text-slate-400" role="status">
          {!status.desktop
            ? "Takes effect in the RealmSwap desktop app for Windows."
            : status.keepingAwake
              ? `Holding this PC awake right now: ${status.reasons.join("; ")}.`
              : "Not holding this PC awake right now."}
        </p>
      </div>

      <div className="p-4 bg-slate-900 border border-white/5 rounded-lg mt-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200">Wake this PC before scheduled starts</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Sets a Windows wake timer a few minutes ahead of the next scheduled server start or Discord game night,
              so a sleeping PC is up in time. Works from sleep and hibernate, not from a full shutdown.
            </p>
          </div>
          <Switch field="wakeForSchedule" label="Wake this PC before scheduled starts" />
        </div>

        <p className="text-xs mt-4 text-slate-400" role="status">
          {status.nextStart
            ? `Next: “${status.nextStart.label}” on ${status.nextStart.serverName}, ${when(status.nextStart.dueAt)}.` +
              (status.wakeRegisteredFor ? ` Wake timer set for ${clock(status.wakeRegisteredFor)}.` : "")
            : "No scheduled starts coming up. Add a Start Server automation under Schedules, or plan a game night from Discord."}
        </p>

        {status.desktop && settings.wakeForSchedule && wakeTimersBlocked && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90">
            <p>
              Windows is set to ignore wake timers on this PC, so it won&rsquo;t wake on its own. Allow them under Power
              Options &rarr; Sleep &rarr; Allow wake timers, or run this in a terminal:
            </p>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 bg-slate-950 border border-white/10 rounded px-2 py-1.5 break-all text-slate-200">{ALLOW_WAKE_TIMERS}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(ALLOW_WAKE_TIMERS).then(() => toast.success("Command copied."))}
                className="px-2.5 py-1.5 rounded font-bold text-slate-200 bg-slate-800 border border-white/10 hover:bg-slate-700 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {status.wakeError && (
          <p className="text-xs mt-3 text-red-400" role="alert">
            Couldn&rsquo;t set the wake timer: {status.wakeError}
          </p>
        )}
      </div>
    </>
  );
}
