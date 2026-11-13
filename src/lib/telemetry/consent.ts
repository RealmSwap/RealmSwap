import { randomUUID } from "crypto";
import { getAppSetting, setAppSetting } from "@/lib/appSettings";

/**
 * Consent + identity for the anonymous usage snapshots. Install-wide: the
 * ADMIN's choice covers this machine. Off by default; switching off deletes
 * the install id, so opting back in starts as a fresh anonymous install
 * rather than silently re-linking old data.
 */

export interface UsageTelemetryState {
  enabled: boolean;
  installId: string | null;
  /** UTC day (YYYY-MM-DD) last sent; a day is sent once. */
  lastSentDay: string | null;
}

const KEY = "telemetry.usage";

export function usageTelemetryConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getUsageTelemetryState(): Promise<UsageTelemetryState> {
  const stored = await getAppSetting<Partial<UsageTelemetryState>>(KEY, {});
  return {
    enabled: stored?.enabled === true,
    installId: typeof stored?.installId === "string" ? stored.installId : null,
    lastSentDay: typeof stored?.lastSentDay === "string" ? stored.lastSentDay : null,
  };
}

export async function setUsageConsent(enabled: boolean): Promise<UsageTelemetryState> {
  const current = await getUsageTelemetryState();
  if (!enabled) {
    const next: UsageTelemetryState = { enabled: false, installId: null, lastSentDay: null };
    await setAppSetting(KEY, next);
    return next;
  }
  const next: UsageTelemetryState = {
    enabled: true,
    installId: current.installId ?? randomUUID(),
    lastSentDay: current.lastSentDay,
  };
  await setAppSetting(KEY, next);
  return next;
}

export async function markUsageSent(day: string, installId: string): Promise<void> {
  await setAppSetting(KEY, { enabled: true, installId, lastSentDay: day });
}
