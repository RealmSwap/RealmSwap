import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import path from "path";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { requireLocalServer } from "@/lib/agents/perimeter";
import { detectMinecraftVersion, readLoaderMarker } from "@/lib/mods/mcLoaders";
import { detectRemoteMinecraftVersion, readRemoteLoaderMarker } from "@/lib/mods/remoteInstallers";
import { listMinecraftReleases } from "@/lib/mods/mcServerJar";
import { upgradeMinecraftVersion, VersionUpgradeError } from "@/lib/mods/versionUpgrade";
import { SandboxBootError } from "@/lib/runners/sandbox";

// GET: the server's Minecraft version, loader, and the switchable releases —
// the Mod Manager's version row.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    if (access.server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ supported: false, releases: [] });
    }

    // Mojang being unreachable shouldn't blank the whole panel — the current
    // version is read from disk, only the picker's options degrade.
    let releases: string[] = [];
    try {
      releases = await listMinecraftReleases();
    } catch (err: any) {
      console.error("GET /api/servers/[id]/version releases:", err);
    }

    if (access.server.runnerType === "AGENT") {
      const [currentVersion, loader] = await Promise.all([
        detectRemoteMinecraftVersion(params.id),
        readRemoteLoaderMarker(params.id),
      ]);
      return NextResponse.json({
        supported: true,
        upgradeSupported: false, // remote nodes have no sandbox boot test yet
        currentVersion,
        loader,
        releases,
      });
    }

    const installDir = path.join(dataRoot(), "local-servers", params.id);
    return NextResponse.json({
      supported: true,
      upgradeSupported: true,
      currentVersion: detectMinecraftVersion(installDir),
      loader: readLoaderMarker(installDir),
      releases,
    });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/version error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST: switch the server's Minecraft version — snapshot, stash an
// incompatible world, swap server.jar, reinstall the loader for the new
// release, sandbox boot test, auto-rollback on failure.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let installId: string | undefined;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Version switching is only supported for Minecraft servers." }, { status: 400 });
    }
    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before switching its Minecraft version." }, { status: 400 });
    }
    if (server.runnerType === "AGENT") {
      return NextResponse.json(
        { error: "Version switching isn't supported on remote nodes yet — the sandbox boot test only exists locally." },
        { status: 400 }
      );
    }
    requireLocalServer(server, "Version switches");

    const bodySchema = z.object({
      targetVersion: z.string().regex(/^[A-Za-z0-9.\-]+$/).max(32),
      installId: z.string().regex(/^[\w-]{6,64}$/).optional(),
    });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    installId = parsed.data.installId;

    const result = await upgradeMinecraftVersion({
      serverId: server.id,
      userId: user.id,
      serverName: server.name,
      targetVersion: parsed.data.targetVersion,
      installId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof VersionUpgradeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/servers/[id]/version error:", error);
    return NextResponse.json(
      {
        error: `Version switch failed and was rolled back. Cause: ${error.message || "unknown error"}`,
        ...(error instanceof SandboxBootError ? { bootOutput: error.output } : {}),
        ...(error.warnings ? { warnings: error.warnings } : {}),
      },
      { status: 500 }
    );
  }
}
