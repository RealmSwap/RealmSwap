import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { computeUsageSnapshot, explainSnapshot } from "@/lib/telemetry/usage";
import { getUsageTelemetryState, setUsageConsent, usageTelemetryConfigured } from "@/lib/telemetry/consent";
import { maybeSendUsageSnapshot } from "@/lib/telemetry/sender";

// GET /api/telemetry/preview → what a daily usage snapshot would send, right
// now, field by field. Visible to any signed-in user; sharing is opt-in and
// ADMIN-controlled, but seeing exactly what would be sent is how consent is
// honest. Nothing here writes.
export async function GET(_req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const state = await getUsageTelemetryState();
    const snapshot = await computeUsageSnapshot();
    return NextResponse.json({
      configured: usageTelemetryConfigured(),
      enabled: state.enabled,
      fields: explainSnapshot(snapshot),
      snapshot,
    });
  } catch (error) {
    console.error("GET /api/telemetry/preview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/telemetry/consent { enabled } — the ADMIN's choice for this
// install. Enabling sends the first snapshot immediately.
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Requires ADMIN" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "Body must be { enabled: boolean }." }, { status: 400 });
    }

    const state = await setUsageConsent(body.enabled);
    let sendResult: string | null = null;
    if (state.enabled && usageTelemetryConfigured()) {
      sendResult = await maybeSendUsageSnapshot(new Date(), { force: true });
    }
    return NextResponse.json({ enabled: state.enabled, sendResult });
  } catch (error) {
    console.error("POST /api/telemetry/consent error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
