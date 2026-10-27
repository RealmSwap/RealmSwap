import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { prisma } from "@/lib/db";
import { readLoaderMarker } from "@/lib/mods/mcLoaders";
import {
  planModpackFromZip, applyModpackPlan, packResultMessage, auditPackInstall, recordInstalledModpack,
  detectPackServerMcVersion, retireReplacedPackMods, PackPreflightError,
} from "@/lib/mods/packInstall";
import { beginProgress, emitProgress, endProgress } from "@/lib/mods/progress";
import { testServerBootWithQuarantine } from "@/lib/mods/bootRetry";
import path from "path";
import { requireLocalServer } from "@/lib/agents/perimeter";

// POST /api/servers/[id]/mods/import-modpack
// Body: multipart form with a `modpack` file in Modrinth .mrpack format or
// CurseForge manifest.json format (resolved through the CurseForge API).
//
// Parsing/pre-flight and the file work live in src/lib/mods/packInstall.ts,
// shared with the one-click pack browser install. Same safety contract for
// both: pre-flight (invalid packs cost nothing) -> snapshot -> download +
// hash verify every manifest file -> apply overrides -> sandbox boot test ->
// automatic rollback on any failure.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    requireLocalServer(server, "Modpack imports");

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
    // Optional progress session key, validated like the JSON routes do.
    const rawInstallId = formData.get("installId");
    const installId = typeof rawInstallId === "string" && /^[\w-]{6,64}$/.test(rawInstallId) ? rawInstallId : undefined;
    if (installId) beginProgress(installId);

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

    if (installId) emitProgress(installId, { stage: "snapshot", label: "Taking a safety snapshot" });
    const snapshot = await createSnapshot(serverId, user.id, `Pre-modpack: ${plan.packName}`);

    try {
      const result = await applyModpackPlan({
        plan, serverId, serverRoot, serverMcVersion, warnings,
        progress: (event) => { if (installId) emitProgress(installId, event); },
      });

      // Sandbox Test
      console.log(`[Sandbox] Running boot test for ${serverId}`);
      await retireReplacedPackMods({ serverId, serverRoot, plan, result, warnings });
      if (installId) emitProgress(installId, { stage: "boot", label: "Booting the server once to verify the install", current: 0, total: 1 });
      const quarantined = await testServerBootWithQuarantine({
        serverId, serverRoot, game: "MINECRAFT", warnings,
        onProgress: (lbl) => { console.log(`[Sandbox] ${lbl}`); if (installId) emitProgress(installId, { label: lbl }); },
      });
      if (quarantined.length > 0) {
        // Quarantined jars' install rows are keyed by jar basename.
        for (const name of quarantined) {
          const packageId = name.replace(/\.jar$/, "");
          await prisma.modInstallation.deleteMany({ where: { serverId, packageId } });
        }
      }
      if (installId) emitProgress(installId, { current: 1 });
      console.log(`[Sandbox] Boot test passed for ${serverId}`);

      await auditPackInstall({ userId: user.id, serverName: server.name, plan, result, warnings });
      await recordInstalledModpack({ serverId, plan, result });

      if (installId) endProgress(installId, "done");
      return NextResponse.json({
        success: true,
        message: packResultMessage({ plan, result, warnings }),
        warnings,
      });

    } catch (installError: any) {
      // Automatic Rollback
      console.error(`[Sandbox] Error detected. Rolling back ${serverId} to snapshot ${snapshot.id}`);
      if (installId) emitProgress(installId, { label: "Install failed — rolling back safely" });
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);
      if (installId) endProgress(installId, "error", installError.message);

      return NextResponse.json({
        error: `Modpack import failed. Safe Rollback completed. Cause: ${installError.message}`,
        ...(installError instanceof SandboxBootError ? { bootOutput: installError.output } : {}),
        ...(warnings.length ? { warnings } : {}),
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/import-modpack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
