"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { InstallProgressPanel, useModInstallProgress } from "@/components/mods/InstallProgress";

/**
 * Phase 2 of a v2 realm deploy. Subscribes to the materialize progress stream
 * (same SSE plumbing as mod installs) and fires the — possibly minutes-long —
 * install POST exactly once on mount. The SSE stream carries stage frames but
 * NOT the HTTP error body, so the POST response is the source of truth for
 * failure text: it lands as a toast while the panel keeps the error state and
 * boot output on screen.
 */
export function RealmDeployProgress({
  serverId,
  installId,
  templateId,
  onFinished,
}: {
  serverId: string;
  installId: string;
  templateId: string;
  onFinished: (ok: boolean) => void;
}) {
  const { event, start, dismiss } = useModInstallProgress(serverId);
  const firedRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return; // dev strict mode runs effects twice
    firedRef.current = true;
    start(installId);
    (async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/realm-materialize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, installId }),
        });
        if (res.ok) return; // success finishes on the terminal "done" frame
        const err = await res.json().catch(() => ({}) as { error?: string });
        toast.error(err.error || "Realm install failed");
        finishedRef.current = true;
        onFinished(false);
      } catch (e) {
        console.error(e);
        toast.error("Realm install failed");
        finishedRef.current = true;
        onFinished(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A successful POST resolves around the same time as the terminal frame;
  // wait for the frame so the panel shows a completed strip before the modal
  // closes. Failures above finish immediately.
  useEffect(() => {
    if (finishedRef.current || event?.stage !== "done") return;
    finishedRef.current = true;
    onFinished(true);
  }, [event?.stage, onFinished]);

  return <InstallProgressPanel event={event} onDismiss={dismiss} />;
}
