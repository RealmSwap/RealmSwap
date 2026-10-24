import { NextRequest, NextResponse } from "next/server";
import { getPublicStatus } from "@/lib/statusShare";

// GET: the public status payload behind /s/<code> — no auth by design. The
// response carries no credentials, addresses or player names (see
// statusShare.ts); the 20s per-code cache inside getPublicStatus bounds how
// often a shared link can hit the game server with query packets.
export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const status = await getPublicStatus(params.code);
    if (!status) {
      return NextResponse.json({ error: "Status page not found" }, { status: 404 });
    }
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/s/[code] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
