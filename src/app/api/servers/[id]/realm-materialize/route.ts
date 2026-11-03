import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { requireLocalServer } from "@/lib/agents/perimeter";
import { dataRoot } from "@/lib/appPaths";
import { parseSpec } from "@/lib/definitions/serialize";
import { downloadFile } from "@/lib/download";
import { createClient } from "@/lib/supabase/server";
import { SandboxBootError, testServerBoot, hasRealBootTest } from "@/lib/runners/sandbox";
import { testServerBootWithQuarantine } from "@/lib/mods/bootRetry";
import { beginProgress, emitProgress, endProgress, createBootLogEmitter } from "@/lib/mods/progress";
import { detectMinecraftVersion } from "@/lib/mods/mcLoaders";
import {
  installModpackOnServer, isPackResolveError, bootOutputOf,
} from "@/lib/mods/installPack";
import { checkLoaderConflict, installPinnedLoader, replayMods, ReplayLoaderRef } from "@/lib/mods/replayCollection";
import { applyConfigOverrides } from "@/lib/templates/installer";

// POST /api/servers/[id]/realm-materialize  { templateId, installId? }
//
// Phase 2 of a v2 realm deploy — the VERIFIED part. The deploy route created
// the server shell; this route fills it with real files through the same
// pipeline as manual installs and boot-tests the result:
//
//   provision vanilla jar (fresh MC dir) → loader pin → provider pack
//   (snapshot → apply → quarantine boot) → pinned mod replay → realm config
//   overrides → sandbox boot test.
//
// ANY failure deletes the server entirely — a failed realm deploy leaves
// nothing half-installed behind ("auto-rollback" at server granularity).
const payloadSchema = z.object({
  templateId: z.string().min(1),
  installId: z.string().regex(/^[\w-]{6,64}$/).optional(),
});

const realmPayloadSchema = z.object({
  mods: z.array(z.object({
    provider: z.string().min(1),
    packageId: z.string().min(1),
    name: z.string().optional(),
    version: z.string().optional(),
    workshopModId: z.string().nullish(),
  })).max(500).default([]),
  configOverrides: z.array(z.object({
    path: z.string().min(1),
    strategy: z.string().default("template"),
    content: z.string(),
  })).max(200).default([]),
  loader: z.object({
    type: z.enum(["fabric", "quilt", "forge", "neoforge", "tmodloader"]),
    loaderVersion: z.string().min(1),
    minecraftVersion: z.string().optional(),
  }).nullish(),
  modpack: z.object({
    kind: z.enum(["curseforge", "mrpack"]),
    projectId: z.string().min(1),
    fileId: z.number().nullable().optional(),
    versionId: z.string().optional(),
  }).nullish(),
});

/**
 * A brand-new MC server dir has no server.jar — the pack pipeline refuses to
 * plan without one (detectPackServerMcVersion) and a vanilla realm would have
 * nothing to boot. Provision the pinned jar from the game definition's spec,
 * exactly what first start would do.
 */
async function ensureVanillaProvisioned(serverId: string, definitionId: string | null): Promise<void> {
  const serverRoot = path.join(dataRoot(), "local-servers", serverId);
  if (detectMinecraftVersion(serverRoot)) return;

  const def = definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { slug: "MINECRAFT" } });
  const spec = def ? parseSpec(def.spec) : null;
  const url = spec?.install && "url" in spec.install ? spec.install.url : undefined;
  if (!url) {
    throw new Error("No server.jar found and the game definition has no download URL — start the server once first.");
  }
  const fileName = spec?.install && "fileName" in spec.install ? spec.install.fileName : "server.jar";
  const dest = path.join(serverRoot, fileName);
  await fs.promises.mkdir(serverRoot, { recursive: true });
  await downloadFile(url, dest);
  // The boot test also does this, but the pack planner reads version.json
  // before any boot happens.
  const eula = path.join(serverRoot, "eula.txt");
  if (!fs.existsSync(eula)) await fs.promises.writeFile(eula, "eula=true\n", "utf-8");
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const serverId = params.id;
  let installId: string | undefined;
  let cleanedUp = false;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = payloadSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid materialize parameters" }, { status: 400 });
    }
    installId = parsed.data.installId;

    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;
    requireLocalServer(server, "Realm installs");

    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Server is busy — materialize needs a stopped server." }, { status: 400 });
    }

    // Re-fetch the realm payload server-side (never trust a client-sent payload).
    const supabase = await createClient();
    const { data: realm, error: realmErr } = await supabase
      .from("realms")
      .select("id, name, game_slug, payload")
      .eq("id", parsed.data.templateId)
      .maybeSingle();
    if (realmErr || !realm) {
      return NextResponse.json({ error: "Realm not found" }, { status: 404 });
    }
    const checked = realmPayloadSchema.safeParse(realm.payload ?? {});
    if (!checked.success) {
      return NextResponse.json({ error: "This realm's payload is not a valid v2 install spec." }, { status: 400 });
    }
    const rp = checked.data;
    const game = server.game.toUpperCase();
    const serverRoot = path.join(dataRoot(), "local-servers", serverId);
    const warnings: string[] = [];
    if (installId) beginProgress(installId);

    try {
      // 1. Fresh MC dirs need the vanilla jar before any planner/boot runs.
      if (game === "MINECRAFT") {
        if (installId) emitProgress(installId, { stage: "resolving", label: "Preparing the server directory" });
        await ensureVanillaProvisioned(serverId, server.definitionId);
      }

      // 2. Provider pack (the big path): snapshot → apply → quarantine boot.
      if (rp.modpack) {
        if (game !== "MINECRAFT") {
          throw new Error("Provider modpack realms are Minecraft-only right now.");
        }
        const result = await installModpackOnServer({
          serverId,
          serverName: server.name,
          userId: user.id,
          // Realm kind vocabulary ("mrpack") maps to the pack pipeline's
          // provider vocabulary ("modrinth") — same packs, different nouns.
          provider: rp.modpack.kind === "mrpack" ? "modrinth" : "curseforge",
          projectId: rp.modpack.projectId,
          fileId: rp.modpack.fileId ?? undefined,
          versionId: rp.modpack.versionId,
          installId,
        });
        warnings.push(...result.warnings);
      } else {
        // 3. Loader pin + pinned mod replay (non-pack realms).
        if (rp.loader) {
          const conflict = checkLoaderConflict(game, serverRoot, rp.loader);
          if (conflict) throw new Error(conflict);
          if (installId) emitProgress(installId, { stage: "loader", label: "Installing the mod loader" });
          await installPinnedLoader(game, serverRoot, rp.loader as ReplayLoaderRef, warnings, (m) => console.log(`[Realm] ${m}`));
        }
        if (rp.mods.length > 0) {
          if (game === "MINECRAFT" && !rp.loader) {
            warnings.push("This realm pins mods but no mod loader — the files are installed, but a vanilla server won't load them.");
          }
          if (installId) emitProgress(installId, { stage: "mods", label: "Installing the realm's mods", current: 0, total: rp.mods.length });
          const depCount = await replayMods({
            game, serverId, serverRoot, loader: null, mods: rp.mods, warnings,
            onLog: (m) => console.log(`[Realm] ${m}`),
          });
          if (installId) emitProgress(installId, { current: rp.mods.length });
          console.log(`[Realm] Replayed ${rp.mods.length} mods (+${depCount} deps) for ${serverId}`);
        }
      }

      // 4. Realm config overrides last — the author's files win over pack defaults.
      if (rp.configOverrides.length > 0) {
        if (installId) emitProgress(installId, { stage: "overrides", label: "Applying the realm's config files" });
        applyConfigOverrides(serverId, rp.configOverrides as Parameters<typeof applyConfigOverrides>[1]);
      }

      // 5. The verdict: a real sandbox boot.
      if (hasRealBootTest(game)) {
        if (installId) emitProgress(installId, { stage: "boot", label: "Booting the server once to verify the realm", current: 0, total: 1 });
        const bootLog = createBootLogEmitter(installId);
        if (game === "MINECRAFT") {
          const quarantined = await testServerBootWithQuarantine({
            serverId, serverRoot, game, warnings,
            onProgress: (lbl) => { if (installId) emitProgress(installId, { label: lbl }); },
            onBootLine: bootLog,
          });
          for (const name of quarantined) {
            const packageId = name.replace(/\.jar$/, "");
            await prisma.modInstallation.deleteMany({ where: { serverId, packageId } });
          }
        } else {
          await testServerBoot(serverId, game);
        }
        if (installId) emitProgress(installId, { current: 1 });
      }

      if (installId) endProgress(installId, "done");
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "DEPLOY_REALM",
          details: `Materialized realm '${realm.name}' on server '${server.name}' (${rp.modpack ? "provider modpack" : `${rp.mods.length} mods`})${warnings.length ? ` Warnings: ${warnings.join(" ")}` : ""}.`,
        },
      });
      return NextResponse.json({
        success: true,
        message: rp.modpack
          ? "Realm verified — modpack installed and boot-tested."
          : `Realm verified — ${rp.mods.length} mods installed${hasRealBootTest(game) ? " and boot-tested" : ""}.`,
        warnings,
      });
    } catch (materializeError: any) {
      // The verdict failed: roll back at SERVER granularity — delete the
      // shell + its directory so a failed deploy leaves nothing behind.
      console.error(`[Realm] materialize failed for ${serverId}, removing the partial server:`, materializeError);
      cleanedUp = true;
      if (installId) endProgress(installId, "error", materializeError.message || "Realm install failed");
      await prisma.server.delete({ where: { id: serverId } }).catch(() => {});
      try { fs.rmSync(serverRoot, { recursive: true, force: true }); } catch (_) {}
      const bootOutput = bootOutputOf(materializeError);
      const mWarnings: string[] = materializeError.warnings ?? warnings;
      return NextResponse.json({
        error: `Realm install failed — the server was removed clean. Cause: ${materializeError.message}`,
        ...(bootOutput ? { bootOutput } : {}),
        ...(mWarnings.length ? { warnings: mWarnings } : {}),
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("POST realm-materialize error:", error);
    if (installId && !cleanedUp) endProgress(installId, "error", error.message || "Realm install failed");
    // NOTE: no cleanup here — this catch only fires for pre-materialization
    // failures (bad params, realm fetch) where the phase-1 shell was never
    // touched. Install failures inside the scoped try delete the server
    // themselves.
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
