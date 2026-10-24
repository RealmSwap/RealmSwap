import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { readLoaderMarker } from "@/lib/mods/mcLoaders";
import {
  planModpackFromZip, applyModpackPlan, packResultMessage, auditPackInstall, recordInstalledModpack,
  detectPackServerMcVersion, PackPreflightError,
} from "@/lib/mods/packInstall";
import path from "path";

// POST /api/servers/[id]/mods/import-modpack
// Body: multipart form with a `modpack` file in Modrinth .mrpack format or
// CurseForge manifest.json format (resolved through the CurseForge API).
//
// Parsing/pre-flight and the file work live in src/lib/mods/packInstall.ts,
// shared with the one-click pack browser install. Same safety contract for
// both: pre-flight (invalid packs cost nothing) -> snapshot -> download +
// hash verify every manifest file -> apply overrides -> sandbox boot test ->
// automatic rollback on any failure.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverId = params.id;

    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before importing a modpack." }, { status: 400 });
    }

    if (server.game.toUpperCase() !== "MINECRAFT") {
      return NextResponse.json({ error: "Modpack import is only supported for Minecraft servers." }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("modpack") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No modpack file provided" }, { status: 400 });
    }

    const serverRoot = path.join(dataRoot(), "local-servers", serverId);
    const warnings: string[] = [];

    // Pre-flight before spending a snapshot, so invalid packs fail without
    // touching the server at all.
    let serverMcVersion: string;
    let plan: Awaited<ReturnType<typeof planModpackFromZip>>;
    try {
      serverMcVersion = detectPackServerMcVersion(serverId);
      plan = await planModpackFromZip({
        zipBuffer: Buffer.from(await file.arrayBuffer()),
        serverMcVersion,
        loaderType: readLoaderMarker(serverRoot)?.type ?? null,
      });
    } catch (preflightError: any) {
      if (preflightError instanceof PackPreflightError) {
        return NextResponse.json({ error: preflightError.message }, { status: 400 });
      }
      throw preflightError;
    }

    const snapshot = await createSnapshot(serverId, user.id, `Pre-modpack: ${plan.packName}`);

    try {
      const result = await applyModpackPlan({ plan, serverId, serverRoot, serverMcVersion, warnings });

      // Sandbox Test
      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await testServerBoot(serverId, "MINECRAFT");
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      await auditPackInstall({ userId: user.id, serverName: server.name, plan, result, warnings });
      await recordInstalledModpack({ serverId, plan, result });

      return NextResponse.json({
        success: true,
        message: packResultMessage({ plan, result, warnings }),
        warnings,
      });

    } catch (installError: any) {
      // Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);

      return NextResponse.json({
        error: `Modpack import failed. Safe Rollback completed. Cause: ${installError.message}`,
        ...(installError instanceof SandboxBootError ? { bootOutput: installError.output } : {}),
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/import-modpack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
