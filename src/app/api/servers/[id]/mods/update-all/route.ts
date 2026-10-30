import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { createSnapshot, restoreSnapshot, discardSnapshot } from "@/lib/snapshots";
import { testServerBoot, SandboxBootError, hasRealBootTest } from "@/lib/runners/sandbox";
import { resolveModUpdate } from "@/lib/mods/updateApply";
import { packOwnedPackageIds } from "@/lib/mods/packInstall";
import { requireLocalServer } from "@/lib/agents/perimeter";

// POST: update every stale mod in ONE snapshot window — resolve all versions
// first (no snapshot unless something actually changes), then apply updates
// sequentially, stop on the first failure, boot-test once at the end, and
// roll the whole window back if anything fails. Rows only move to the new
// versions after the boot test passes, so a rollback never leaves the DB
// claiming versions that are no longer on disk.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;
    requireLocalServer(server, "Mod updates");
    const serverId = server.id;
    const game = server.game.toUpperCase();

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Stop the server before updating mods." }, { status: 400 });
    }

    const installations = await prisma.modInstallation.findMany({ where: { serverId } });
    const skipped: { packageId: string; name: string; reason: string }[] = [];

    // Pack-owned mods move as a unit via update-pack; bumping one to
    // provider-latest breaks the pins the rest of the pack was resolved
    // against (live: kubejs .374 → .377 broke kubejstweaks' mixins). Disabled
    // mods aren't loaded, so there is nothing to update for them.
    const packOwned = await packOwnedPackageIds(serverId);
    const notDisabled = installations.filter((i) => !i.disabled);
    const updatable = notDisabled.filter((i) => !packOwned.has(i.packageId));
    const packOwnedCount = notDisabled.length - updatable.length;

    // Resolution phase — network lookups happen before any snapshot so a
    // dead provider or up-to-date server never creates a rollback point.
    const planned: {
      installationId: string;
      name: string;
      from: string;
      to: string;
      applyUpdate: () => Promise<void>;
      rowPatch?: Record<string, string>;
      warnings?: string[];
    }[] = [];
    for (const installation of updatable) {
      if (!["modrinth", "thunderstore", "workshop", "curseforge", "ficsit"].includes(installation.provider)) {
        continue; // rows without an update path (umod is per-plugin on purpose); the updates check already reports them
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
            rowPatch: resolved.rowPatch,
            warnings: resolved.warnings,
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
          data: { version: item.to, updatedAt: new Date(), ...(item.rowPatch ?? {}) },
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
        message: `Updated ${planned.length} mod${planned.length === 1 ? "" : "s"} to the latest versions${hasRealBootTest(game) ? " and passed sandbox testing" : ""}.` +
          (packOwnedCount > 0 ? ` ${packOwnedCount} modpack-owned mod${packOwnedCount === 1 ? " was" : "s were"} left out — packs are updated as a unit via update-pack.` : "") +
          (() => {
            const notes = planned.flatMap((p) => p.warnings ?? []);
            return notes.length ? ` Warnings: ${Array.from(new Set(notes)).join(" ")}` : "";
          })(),
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
