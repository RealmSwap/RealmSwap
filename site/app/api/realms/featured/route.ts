import { NextResponse } from "next/server";

import { getFeaturedRealms } from "@/lib/backend/realms";

// GET /api/realms/featured — top public realms for the marketing showcase.
//
// Reads live data from the shared Supabase backend (anon key, RLS-gated). Marked
// dynamic so it reflects live data; the Cache-Control header lets Vercel's edge
// serve a cached copy for a minute to protect the database under traffic.
export const dynamic = "force-dynamic";

export async function GET() {
  const realms = await getFeaturedRealms(6);
  return NextResponse.json(
    { realms },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
