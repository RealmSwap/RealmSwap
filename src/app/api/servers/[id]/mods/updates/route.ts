import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { dataRoot } from "@/lib/appPaths";
import { checkModUpdates } from "@/lib/mods/updates";

/**
 * Read-only "what's stale?" check for the Installed-tab banner: compares
 * installed versions against provider latests (Modrinth for Minecraft jars,
 * Thunderstore packages otherwise). Never installs anything.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await verifyServerAccess(params.id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Server not found" }, { status: 403 });
  }

  try {
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
      game: access.server.game.toUpperCase(),
      serverRoot,
      rows,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Update check failed:", err);
    return NextResponse.json({ error: `Update check failed: ${err.message}` }, { status: 500 });
  }
}
