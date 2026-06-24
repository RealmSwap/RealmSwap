import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { getRunner } from "@/lib/runners";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING" || server.status === "UPDATING") {
      return NextResponse.json(
        { error: "Server must be stopped before updating." },
        { status: 400 }
      );
    }

    if (server.game.toUpperCase() === "MINECRAFT") {
      return NextResponse.json(
        { error: "Minecraft servers are updated by replacing the server.jar file. SteamCMD update is not applicable." },
        { status: 400 }
      );
    }

    // Run update in background (don't await — it streams progress to logs)
    const runner = getRunner(server.runnerType);
    runner.update(server, null).catch((err) => {
      console.error(`Background update failed for ${params.id}:`, err);
    });

    return NextResponse.json({ success: true, message: "Update started. Check the console for progress." });
  } catch (error: any) {
    console.error("POST /api/servers/[id]/update error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
