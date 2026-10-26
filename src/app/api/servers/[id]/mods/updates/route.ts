import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { checkModUpdates } from "@/lib/mods/updates";
import { readRemoteLoaderMarker } from "@/lib/mods/remoteInstallers";

/**
 * Read-only "what's stale?" check for the Installed-tab banner: compares
 * installed versions against provider latests (Modrinth for Minecraft jars,
 * Thunderstore packages otherwise). Never installs anything.
 *
 * AGENT servers: the thunderstore/workshop branches are provider-index-only
 * and work as-is; the Minecraft branches read the loader marker + server
 * version off disk, so they're fed from the node's marker instead. A
 * markerless (vanilla) node server can't be compat-matched — its jar rows
 * report as "unknown" rather than claiming updates that may not apply.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await verifyServerAccess(params.id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Server not found" }, { status: 403 });
  }

  try {
    const game = access.server.game.toUpperCase();

    if (access.server.runnerType === "AGENT") {
      const rows = await prisma.modInstallation.findMany({
        where: { serverId: params.id },
        select: { provider: true, packageId: true, version: true, name: true },
        orderBy: { installedAt: "desc" },
      });
      if (rows.length === 0) {
        return NextResponse.json({ updates: [], unknown: [], errors: [] });
      }
      let deps: { mcVersion?: string | null; loader?: string | null } = {};
      let effectiveRows = rows;
      if (game === "MINECRAFT") {
        const marker = await readRemoteLoaderMarker(params.id);
        if (marker?.minecraftVersion) {
          deps = { mcVersion: marker.minecraftVersion, loader: marker.type };
        } else {
          effectiveRows = rows.map((r) =>
            r.provider === "modrinth" || r.provider === "curseforge" ? { ...r, version: "unknown" } : r
          );
          deps = { mcVersion: null, loader: null };
        }
      }
      const result = await checkModUpdates({ game, serverRoot: "", rows: effectiveRows, deps });
      return NextResponse.json(result);
    }

    const rows = await prisma.modInstallation.findMany({
      where: { serverId: params.id },
      select: { provider: true, packageId: true, version: true, name: true },
      orderBy: { installedAt: "desc" },
    });

    if (rows.length === 0) {
      return NextResponse.json({ updates: [], unknown: [], errors: [] });
    }

    const serverRoot = path.join(dataRoot(), "local-servers", params.id);
    const result = await checkModUpdates({
      game,
      serverRoot,
      rows,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Update check failed:", err);
    return NextResponse.json({ error: `Update check failed: ${err.message}` }, { status: 500 });
  }
}
