import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { analyzeServerReadiness, getRecommendations, AdvisorPreferences } from "@/lib/cloud-advisor/engine";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // The readiness engine resolves the server by bare id — gate the caller
    // on server access first so this can't probe other users' servers.
    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const body = await req.json();
    const preferences = body.preferences as AdvisorPreferences;

    // 1. Get Readiness Score
    const readiness = await analyzeServerReadiness(params.id);

    // 2. Get Recommendations based on preferences
    const recommendations = await getRecommendations(params.id, preferences, readiness.metrics);

    return NextResponse.json({
      readiness,
      recommendations
    });
  } catch (err: any) {
    console.error("Advisor Analyze Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
