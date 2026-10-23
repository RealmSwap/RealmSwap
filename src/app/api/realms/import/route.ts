import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRunner } from "@/lib/runners/factory";
import { swapDirIntoPlace, withServerLock } from "@/lib/atomicFs";
import { GAME_ICONS } from "@/lib/gameDisplay";
import fs from "fs";
import path from "path";
import * as tar from "tar";
import { z } from "zod";

// The manifest is client-supplied JSON that lands in the DB and shapes the
// extracted server — it gets the same zod treatment as every other route
// input. Games not in the app's registry are refused rather than creating a
// server nothing can start.
const manifestSchema = z.object({
  formatVersion: z.number().int().optional(),
  exportDate: z.string().optional(),
  server: z.object({
    name: z.string().min(1).max(100),
    game: z.string().refine((g) => g in GAME_ICONS, { message: "Unsupported game in package manifest" }),
    ramAllocation: z.number().min(1).max(128).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    password: z.string().max(128).nullable().optional(),
    paramValues: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  mods: z.array(z.object({
    provider: z.string().min(1).max(40),
    packageId: z.string().min(1).max(200),
    version: z.string().max(100),
    name: z.string().min(1).max(200),
    dependencies: z.string().nullable().optional(),
  })).optional(),
  automations: z.array(z.object({
    name: z.string().min(1).max(100),
    enabled: z.boolean().optional(),
    triggerType: z.string().min(1).max(50),
    triggerConfig: z.string().max(10000).nullable().optional(),
    actions: z.array(z.object({
      type: z.string().min(1).max(50),
      order: z.number().int().optional(),
      config: z.string().max(10000).nullable().optional(),
    })).optional(),
    conditions: z.array(z.object({
      type: z.string().min(1).max(50),
      operator: z.string().max(20).nullable().optional(),
      value: z.string().max(200).nullable().optional(),
    })).optional(),
  })).optional(),
});

const importBodySchema = z.object({
  uploadId: z.string().uuid(),
  mode: z.enum(["NEW", "REPLACE"]),
  serverId: z.string().optional(),
  manifest: manifestSchema,
});

// Must mirror the registry in realms/validate (same global slot).
const globalForUploads = globalThis as unknown as {
  realmUploads: Map<string, { path: string; expiresAt: number }>;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const body = importBodySchema.safeParse(await req.json());
    if (!body.success) {
      return new NextResponse(`Invalid import request: ${body.error.issues.map((i) => i.message).join("; ")}`, { status: 400 });
    }
    const { uploadId, mode, serverId, manifest } = body.data;

    // Claim the uploaded archive. The id is opaque and one-shot, so a caller
    // can never point the extractor at an arbitrary filesystem path.
    const uploads = globalForUploads.realmUploads;
    const upload = uploads?.get(uploadId);
    if (!upload || upload.expiresAt < Date.now()) {
      return new NextResponse("Uploaded package not found or expired. Please upload again.", { status: 400 });
    }
    uploads.delete(uploadId);
    const tempFile = upload.path;

    if (!fs.existsSync(tempFile)) {
      return new NextResponse("Uploaded package file is gone. Please upload again.", { status: 400 });
    }

    const dataDir = process.env.GAMEVAULT_DATA_DIR || process.cwd();

    let targetServerId = serverId;
    let serverRecord;

    if (mode === "REPLACE") {
      if (!targetServerId) {
        try { fs.unlinkSync(tempFile); } catch (_) {}
        return new NextResponse("Server ID required for REPLACE mode", { status: 400 });
      }
      serverRecord = await prisma.server.findUnique({
        where: { id: targetServerId, userId: session.id }
      });
      if (!serverRecord) {
        try { fs.unlinkSync(tempFile); } catch (_) {}
        return new NextResponse("Target server not found or unauthorized", { status: 404 });
      }

      const runner = getRunner(serverRecord.runnerType);
      if (serverRecord.status === "RUNNING" || serverRecord.status === "STARTING") {
        await runner.stop(serverRecord);
        await prisma.server.update({ where: { id: serverRecord.id }, data: { status: "STOPPED" } });
      }
    } else {
      // NEW mode
      serverRecord = await prisma.server.create({
        data: {
          userId: session.id,
          name: `${manifest.server.name} (Imported)`,
          game: manifest.server.game,
          ramAllocation: manifest.server.ramAllocation || 4,
          region: "LOCAL",
          status: "STOPPED",
          runnerType: "LOCAL",
          ipAddress: "127.0.0.1",
          port: manifest.server.port || 25565,
          password: manifest.server.password || null,
          paramValues: manifest.server.paramValues ? JSON.stringify(manifest.server.paramValues) : null,
          localPath: "" // Set below
        }
      });
      targetServerId = serverRecord.id;

      const serverPath = path.join(dataDir, "local-servers", targetServerId);
      await prisma.server.update({
        where: { id: targetServerId },
        data: { localPath: serverPath }
      });
      serverRecord.localPath = serverPath;
    }

    const targetPath = serverRecord.localPath || path.join(dataDir, "local-servers", targetServerId);

    // Extract into a staging directory and swap it into place, so a failed or
    // interrupted extraction can never leave the live server directory as a
    // mix of old and new files.
    await withServerLock(targetServerId, async () => {
      const stagingPath = `${targetPath}.import-staging`;
      fs.rmSync(stagingPath, { recursive: true, force: true });
      try {
        fs.mkdirSync(stagingPath, { recursive: true });
        await tar.x({
          file: tempFile,
          cwd: stagingPath
        });
        swapDirIntoPlace(stagingPath, targetPath);
      } finally {
        fs.rmSync(stagingPath, { recursive: true, force: true });
      }
    });

    // We can delete realm.json if we want
    const realmJsonPath = path.join(targetPath, "realm.json");
    if (fs.existsSync(realmJsonPath)) fs.unlinkSync(realmJsonPath);

    // Only now that the files have safely landed do we touch rows — the old
    // code deleted mod/automation rows before extracting, so a failed
    // extraction destroyed them for nothing.
    if (mode === "REPLACE") {
      await prisma.modInstallation.deleteMany({ where: { serverId: targetServerId } });
      await prisma.automation.deleteMany({ where: { serverId: targetServerId } });
    }

    // Reconstruct mods
    for (const m of manifest.mods ?? []) {
      await prisma.modInstallation.create({
        data: {
          serverId: targetServerId,
          provider: m.provider,
          packageId: m.packageId,
          version: m.version,
          name: m.name,
          dependencies: m.dependencies || null
        }
      });
    }

    // Reconstruct automations
    for (const a of manifest.automations ?? []) {
      await prisma.automation.create({
        data: {
          serverId: targetServerId,
          name: a.name,
          enabled: a.enabled ?? true,
          triggerType: a.triggerType,
          triggerConfig: a.triggerConfig,
          actions: {
            create: a.actions?.map((act) => ({
              type: act.type,
              order: act.order ?? 0,
              config: act.config ?? null
            })) || []
          },
          conditions: {
            create: a.conditions?.map((cond) => ({
              type: cond.type,
              operator: cond.operator ?? "",
              value: cond.value ?? ""
            })) || []
          }
        }
      });
    }

    // Delete the temp file
    try { fs.unlinkSync(tempFile); } catch (_) {}

    return NextResponse.json({ success: true, serverId: targetServerId });

  } catch (err: any) {
    console.error(err);
    return new NextResponse(err.message, { status: 500 });
  }
}
