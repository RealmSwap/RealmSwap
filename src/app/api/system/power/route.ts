import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getPowerSettings, updatePowerSettings } from "@/lib/power/settings";
import { computeKeepAwake } from "@/lib/power/keepAwake";
import { loadScheduledStarts, nextStartToWakeFor, wakeTimeFor } from "@/lib/power/wakePlan";
import { syncWakeTask, wakeSupported } from "@/lib/power/wakeScheduler";
import { readWakeTimerPolicy } from "@/lib/power/wakeTimer";

// GET /api/system/power   → { settings, status }
// PUT /api/system/power   { keepAwake?, keepAwakeWhileRunning?, wakeForSchedule? } → { settings, status }
//
// Install-wide power behavior for the PC RealmSwap runs on, ADMIN only: how
// RealmSwap may hold it awake, whether it sets a wake timer ahead of scheduled
// starts, and what it is doing about either right now — so "why is my PC
// still on?" and "why didn't it wake?" both have an answer on screen.

async function describe() {
  const now = new Date();
  const settings = await getPowerSettings();
  const decision = await computeKeepAwake(now);
  const next = nextStartToWakeFor(await loadScheduledStarts(now), now);

  // Only the Windows desktop app owns a host PC whose sleep it manages;
  // anywhere else this reports the plan without touching the system.
  const desktop = wakeSupported();
  const wake = desktop ? await syncWakeTask({ now }) : { registeredFor: null, error: null };
  const wakeTimers = desktop ? await readWakeTimerPolicy().catch(() => null) : null;

  return {
    settings,
    status: {
      desktop,
      keepingAwake: decision.keepAwake,
      reasons: decision.reasons,
      nextStart: next
        ? {
            serverName: next.serverName,
            label: next.label,
            source: next.source,
            dueAt: next.dueAt.toISOString(),
            wakeAt: wakeTimeFor(next).toISOString(),
          }
        : null,
      wakeRegisteredFor: wake.registeredFor,
      wakeError: wake.error,
      wakeTimers,
    },
  };
}

async function requireAdmin() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Requires ADMIN" }, { status: 403 });
  return null;
}

export async function GET(_req: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;
    return NextResponse.json(await describe());
  } catch (error) {
    console.error("GET /api/system/power error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
    }
    await updatePowerSettings(body as Record<string, unknown>);
    return NextResponse.json(await describe());
  } catch (error) {
    console.error("PUT /api/system/power error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
