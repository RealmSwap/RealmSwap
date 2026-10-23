import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { reconcileInstalledMods } from "@/lib/mods/reconcile";

/**
 * Re-run the disk↔DB reconcile on demand (the Installed tab fires this on
 * load) so drift from hand-deleted files or manual edits is corrected
 * everywhere, not just after snapshot/backup restores. Returns the refreshed
 * mod list so the UI doesn't need a second round-trip.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await verifyServerAccess(params.id, user.id, "ADMIN");
  if (!access) {
    return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
  }

  try {
    const result = await reconcileInstalledMods(params.id);
    const mods = await prisma.modInstallation.findMany({
      where: { serverId: params.id },
      orderBy: { installedAt: "desc" },
    });
    return NextResponse.json({ result, mods });
  } catch (err: any) {
    console.error("Mod reconcile failed:", err);
    return NextResponse.json({ error: `Reconcile failed: ${err.message}` }, { status: 500 });
  }
}
