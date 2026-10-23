import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError } from "@/lib/runners/sandbox";
import { resolveModUpdate } from "@/lib/mods/updateApply";

// POST: update every stale mod in ONE snapshot window — resolve all versions
// first (no snapshot unless something actually changes), then apply updates
// sequentially, stop on the first failure, boot-test once at the end, and
// roll the whole window back if anything fails. Rows only move to the new
// versions after the boot test passes, so a rollback never leaves the DB
// claiming versions that are no longer on disk.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;
    const serverId = server.id;
    const game = server.game.toUpperCase();

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before updating mods." }, { status: 400 });
    }

    const installations = await prisma.modInstallation.findMany({ where: { serverId } });
    const skipped: { packageId: string; name: string; reason: string }[] = [];

    // Resolution phase — network lookups happen before any snapshot so a
    // dead provider or up-to-date server never creates a rollback point.
    const planned: {
      installationId: string;
      name: string;
      from: string;
      to: string;
      applyUpdate: () => Promise<void>;
    }[] = [];
    for (const installation of installations) {
      if (installation.provider !== "modrinth" && installation.provider !== "thunderstore") {
        continue; // workshop/curseforge rows have no update path; the updates check already reports them
      }
      try {
        const resolved = await resolveModUpdate(installation, game, serverId);
        if (resolved.newVersionNumber === installation.version) {
          skipped.push({ packageId: installation.packageId, name: installation.name, reason: "Already up to date" });
        } else {
          planned.push({
            installationId: installation.id,
            name: installation.name,
            from: installation.version,
            to: resolved.newVersionNumber,
            applyUpdate: resolved.applyUpdate,
          });
        }
      } catch (err: any) {
        skipped.push({ packageId: installation.packageId, name: installation.name, reason: err.message });
      }
    }

    if (planned.length === 0) {
      return NextResponse.json({
        success: true,
        updated: [],
        skipped,
        message: installations.length === 0 ? "No mods installed." : "No mod updates available.",
      });
    }

    const snapshot = await createSnapshot(serverId, user.id, `Pre-update-all (${planned.length} mods)`);
    let applied = 0;
    try {
      for (const item of planned) {
        await item.applyUpdate(); // stop-on-failure: the catch below rolls the whole window back
        applied += 1;
      }

      await testServerBoot(serverId, game);

      for (const item of planned) {
        await prisma.modInstallation.update({
          where: { id: item.installationId },
          data: { version: item.to, updatedAt: new Date() },
        });
      }
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "UPDATE_MOD",
          details: `Updated ${planned.length} mods on server '${server.name}': ${planned
            .map((p) => `${p.name} ${p.from} → ${p.to}`)
            .join(", ")}.`,
        },
      });

      return NextResponse.json({
        success: true,
        updated: planned.map(({ name, from, to }) => ({ name, from, to })),
        skipped,
        message: `Updated ${planned.length} mod${planned.length === 1 ? "" : "s"} to the latest versions and passed sandbox testing.`,
      });
    } catch (err: any) {
      await restoreSnapshot(snapshot.id);
      await discardSnapshot(snapshot.id);
      return NextResponse.json({
        error: `Update-all failed and was fully rolled back (snapshot restored). Cause: ${err.message}`,
        rolledBack: true,
        updatedBeforeFailure: planned.slice(0, applied).map(({ name, from, to }) => ({ name, from, to })),
        skipped,
        ...(err instanceof SandboxBootError ? { bootOutput: err.output } : {}),
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("POST /api/servers/[id]/mods/update-all error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
