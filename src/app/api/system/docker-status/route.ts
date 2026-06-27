import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { isDockerAvailable } from "@/lib/runners/docker/dockerCli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/system/docker-status -> { available: boolean }
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let available = false;
  try {
    available = await isDockerAvailable();
  } catch {
    available = false;
  }
  return NextResponse.json({ available });
}
