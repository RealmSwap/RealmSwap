import { NextRequest, NextResponse } from "next/server";
import { secureSecretEquals } from "@/lib/secureCompare";
import { computeKeepAwake } from "@/lib/power/keepAwake";

// GET /api/system/keep-awake
//
// Asked by the desktop shell every few seconds: should this PC be held awake
// right now, and why? Same trust channel as /api/system/shutdown — the
// per-launch internal token only the Electron main process holds.
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-internal-token");
  if (!secureSecretEquals(process.env.GAMEVAULT_INTERNAL_TOKEN, token)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json(await computeKeepAwake());
  } catch (error) {
    console.error("GET /api/system/keep-awake error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
