import { NextResponse } from "next/server";

import { isBackendConfigured } from "@/lib/backend/supabase";

// Server-runtime health check — NO-OP BASELINE.
//
// This route exists to prove the site now runs on Vercel's Next.js runtime: a
// route handler like this CANNOT exist under a static export (`output: 'export'`).
// It reports liveness and whether the shared-backend env vars are present. It
// does NOT connect to anything. `force-dynamic` keeps it out of any static cache
// so it always reflects the live environment.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "realmswap-site",
    backendConfigured: isBackendConfigured(),
  });
}
