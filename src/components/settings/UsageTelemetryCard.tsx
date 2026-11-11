"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface TelemetryPreview {
  configured: boolean;
  enabled: boolean;
  fields: { field: string; value: unknown; meaning: string }[];
}

/**
 * "Share anonymous usage milestones" — the install's ADMIN decides for the
 * machine. Once a day, a derived summary leaves the machine; this card shows
 * exactly what one contains before anyone is asked to agree, because consent
 * with a blindfold isn't consent.
 */
export function UsageTelemetryCard({ isAdmin }: { isAdmin: boolean }) {
  const [preview, setPreview] = useState<TelemetryPreview | null>(null);
  const [showFields, setShowFields] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/telemetry")
      .then((res) => (res.ok ? res.json() : null))
      .then(setPreview)
      .catch(() => {});
  }, []);

  if (!preview?.configured || !isAdmin) return null;

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !preview.enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save the setting.");
      toast.success(data.enabled ? "Usage milestones on — thank you!" : "Usage milestones off.");
      const fresh = await fetch("/api/telemetry");
      if (fresh.ok) setPreview(await fresh.json());
    } catch (err: any) {
      toast.error(err?.message || "Could not save the setting.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 bg-slate-900 border border-white/5 rounded-lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Share anonymous usage milestones</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Once a day, send a tiny summary of how this install is used: how many servers exist, which games,
            and which milestones happened (first boot, first friend online, a planned game night…). No names,
            addresses, passwords, or player data — nothing ties it to you or your servers. Off by default.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={preview.enabled}
            disabled={saving}
            onChange={toggle}
          />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
        </label>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowFields(!showFields)}
          className="text-xs font-bold text-accentPurple hover:text-accentPurpleHover transition-colors"
        >
          {showFields ? "Hide exactly what's sent" : "See exactly what's sent"}
        </button>
        {showFields && (
          <div className="mt-2 rounded-lg bg-slate-950 border border-white/10 p-3 text-xs space-y-1.5 max-h-64 overflow-y-auto">
            {preview.fields.map((f) => (
              <div key={f.field} className="flex items-baseline gap-2">
                <code className="text-accentPurple shrink-0">{f.field}</code>
                <span className="text-slate-200 font-mono shrink-0">{JSON.stringify(f.value)}</span>
                <span className="text-slate-500">{f.meaning}</span>
              </div>
            ))}
            <p className="text-slate-500 pt-1 border-t border-white/5">
              Sent once a day while this is on. Turning it off (and back on) starts a brand-new anonymous id.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3" role="status">
        {preview.enabled ? "Sending once a day." : "Off — nothing is sent."}
      </p>
    </div>
  );
}
