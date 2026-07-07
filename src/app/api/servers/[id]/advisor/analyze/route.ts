import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { analyzeServerReadiness, getRecommendations, AdvisorPreferences } from "@/lib/cloud-advisor/engine";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
