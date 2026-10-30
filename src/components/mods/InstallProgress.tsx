"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Package, Rocket, ShieldCheck, Wrench, XCircle, CheckCircle2 } from "lucide-react";

/** Mirror of the server's ModProgressEvent shape (src/lib/mods/progress.ts). */
export interface ModProgressEvent {
  stage: "resolving" | "snapshot" | "loader" | "mcswap" | "mods" | "overrides" | "boot" | "done" | "error";
  label?: string;
  current?: number;
  total?: number;
  bytesDone?: number;
  bytesTotal?: number;
  bootLines?: string[];
  error?: string;
}

const STAGE_META: Record<ModProgressEvent["stage"], { title: string; Icon: typeof Download }> = {
  resolving: { title: "Resolving", Icon: Loader2 },
  snapshot: { title: "Safety snapshot", Icon: ShieldCheck },
  mcswap: { title: "Minecraft version", Icon: Package },
  loader: { title: "Mod loader", Icon: Wrench },
  mods: { title: "Downloading mods", Icon: Download },
  overrides: { title: "Pack configs", Icon: Package },
  boot: { title: "Boot test", Icon: Rocket },
  done: { title: "Done", Icon: CheckCircle2 },
  error: { title: "Failed", Icon: XCircle },
};

/** Stage order for the step strip; terminal stages are not steps. */
const STEP_ORDER: ModProgressEvent["stage"][] = ["snapshot", "mcswap", "loader", "mods", "overrides", "boot"];

export function newInstallId(): string {
  // crypto.randomUUID exists in every browser RealmSwap targets (Electron
  // Chromium + modern desktop browsers); the fallback keeps SSR type-checks
  // honest.
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return uuid.replace(/[^\w-]/g, "").slice(0, 48);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Overall percent for the bar. Bytes win when the provider reported sizes
 * (pack downloads); otherwise count-based progress within the current stage,
 * mapped onto that stage's slice of the strip so the bar never jumps back.
 */
export function overallPercent(ev: ModProgressEvent | null): number {
  if (!ev) return 0;
  if (ev.stage === "done") return 100;
  const idx = STEP_ORDER.indexOf(ev.stage);
  if (idx === -1) return 0;
  const slice = 100 / STEP_ORDER.length;
  let within = 0;
  if (ev.stage === "mods" && ev.bytesTotal && ev.bytesTotal > 0 && ev.bytesDone !== undefined) {
    within = Math.min(1, ev.bytesDone / ev.bytesTotal);
  } else if (ev.total && ev.total > 0 && ev.current !== undefined) {
    within = Math.min(1, ev.current / ev.total);
  }
  return Math.min(99, Math.round(idx * slice + within * slice));
}

/**
 * Subscribe to a mod operation's live progress. Call `start()` with the
 * installId BEFORE firing the POST so the first frames aren't missed (the
 * hub also replays the current state on connect, so a late subscriber still
 * catches up). Closes itself on the terminal frame.
 */
export function useModInstallProgress(serverId: string | undefined) {
  const [event, setEvent] = useState<ModProgressEvent | null>(null);
  const [active, setActive] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const start = useCallback((installId: string) => {
    if (!serverId) return;
    stop();
    setEvent({ stage: "resolving", label: "Starting…" });
    setActive(true);
    const es = new EventSource(`/api/servers/${serverId}/mods/install-progress?installId=${encodeURIComponent(installId)}`);
    es.addEventListener("progress", (msg) => {
      try {
        const next = JSON.parse((msg as MessageEvent).data) as ModProgressEvent;
        setEvent(next);
        if (next.stage === "done" || next.stage === "error") {
          es.close();
          sourceRef.current = null;
        }
      } catch {
        /* malformed frame — ignore */
      }
    });
    es.onerror = () => {
      // The server closes the stream after the terminal frame; a plain
      // network drop just leaves the last known state on screen.
      es.close();
      sourceRef.current = null;
    };
    sourceRef.current = es;
  }, [serverId, stop]);

  /** Hide the panel (e.g. after the result toast lands). */
  const dismiss = useCallback(() => {
    stop();
    setActive(false);
    setEvent(null);
  }, [stop]);

  // A successful run auto-clears after a beat — the route's success banner
  // carries the summary. Failures stay until dismissed so the error reads.
  useEffect(() => {
    if (event?.stage !== "done") return;
    const t = setTimeout(dismiss, 4000);
    return () => clearTimeout(t);
  }, [event?.stage, dismiss]);

  useEffect(() => stop, [stop]);

  return { event, active, start, dismiss };
}

export function InstallProgressPanel({ event, onDismiss }: { event: ModProgressEvent | null; onDismiss: () => void }) {
  if (!event) return null;
  const pct = overallPercent(event);
  const meta = STAGE_META[event.stage];
  const terminal = event.stage === "done" || event.stage === "error";
  const Icon = meta.Icon;
  const spinning = !terminal && (event.stage === "resolving" || event.stage === "boot" || event.stage === "loader" || event.stage === "snapshot");

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        event.stage === "error"
          ? "border-red-500/40 bg-red-500/10"
          : event.stage === "done"
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-violet-500/40 bg-violet-500/10"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${spinning ? "animate-spin" : ""} ${event.stage === "error" ? "text-red-400" : event.stage === "done" ? "text-emerald-400" : "text-violet-400"}`} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-100">{meta.title}</div>
            {(event.label || event.error) && (
              <div className="text-xs text-slate-400 truncate" title={event.error || event.label}>
                {event.stage === "error" ? event.error : event.label}
              </div>
            )}
          </div>
        </div>
        <div className="text-xs font-mono text-slate-400 shrink-0 text-right">
          {event.stage === "mods" && event.total ? (
            <div>{event.current ?? 0} / {event.total} files</div>
          ) : null}
          {event.bytesDone !== undefined && event.bytesDone > 0 && (
            <div>
              {formatBytes(event.bytesDone)}
              {event.bytesTotal ? ` / ${formatBytes(event.bytesTotal)}` : ""}
            </div>
          )}
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            event.stage === "error" ? "bg-red-500" : event.stage === "done" ? "bg-emerald-500" : "bg-violet-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Live boot-test output — a modded boot can run for minutes; this is
          what the sandboxed server is printing right now. Kept visible when
          the boot fails: the last lines before the exit are usually the
          actual cause. */}
      {(event.stage === "boot" || event.stage === "error") && event.bootLines && event.bootLines.length > 0 && (
        <pre className="max-h-28 overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-slate-300 whitespace-pre-wrap break-all">
          {event.bootLines.join("\n")}
        </pre>
      )}

      <div className="flex items-center justify-between">
        <ol className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
          {STEP_ORDER.map((stage) => {
            const stageIdx = STEP_ORDER.indexOf(stage);
            const currentIdx = STEP_ORDER.indexOf(event.stage);
            const state =
              event.stage === "done" || stageIdx < currentIdx ? "done" : stageIdx === currentIdx ? "active" : "todo";
            return (
              <li
                key={stage}
                className={
                  state === "done"
                    ? "text-emerald-400"
                    : state === "active"
                      ? "text-slate-100 font-semibold"
                      : "text-slate-600"
                }
              >
                {STAGE_META[stage].title}
                {stageIdx < STEP_ORDER.length - 1 && <span className="mx-1 text-slate-700">›</span>}
              </li>
            );
          })}
        </ol>
        {terminal && (
          <button type="button" onClick={onDismiss} className="text-xs text-slate-400 hover:text-slate-100">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
