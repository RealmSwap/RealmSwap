import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRunner } from "@/lib/runners/factory";
import fs from "fs";
import path from "path";
import * as tar from "tar";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const { tempFile, mode, serverId, manifest } = body;

    if (!tempFile || !fs.existsSync(tempFile)) {
      return new NextResponse("Temporary package not found. Please upload again.", { status: 400 });
    }

    if (!manifest || !manifest.server) {
      return new NextResponse("Invalid manifest format", { status: 400 });
    }

    const dataDir = process.env.GAMEVAULT_DATA_DIR || process.cwd();
    
    let targetServerId = serverId;
    let serverRecord;

    if (mode === "REPLACE") {
      if (!targetServerId) return new NextResponse("Server ID required for REPLACE mode", { status: 400 });
      serverRecord = await prisma.server.findUnique({
        where: { id: targetServerId, userId: session.id }
      });
      if (!serverRecord) return new NextResponse("Target server not found or unauthorized", { status: 404 });
      
      const runner = getRunner(serverRecord.runnerType);
      if (serverRecord.status === "RUNNING") {
        await runner.stop(serverRecord);
        await prisma.server.update({ where: { id: serverRecord.id }, data: { status: "STOPPED" } });
      }

      // Cleanup existing mods and tasks
      await prisma.modInstallation.deleteMany({ where: { serverId: targetServerId } });
      await prisma.scheduledTask.deleteMany({ where: { serverId: targetServerId } });
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
    fs.mkdirSync(targetPath, { recursive: true });

    // Extract tar file
    await tar.x({
      file: tempFile,
      cwd: targetPath
    });

    // We can delete realm.json if we want
    const realmJsonPath = path.join(targetPath, "realm.json");
    if (fs.existsSync(realmJsonPath)) fs.unlinkSync(realmJsonPath);

    // Reconstruct mods
    if (manifest.mods && Array.isArray(manifest.mods)) {
      for (const m of manifest.mods) {
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
    }

    // Reconstruct scheduled tasks
    if (manifest.tasks && Array.isArray(manifest.tasks)) {
      for (const t of manifest.tasks) {
        await prisma.scheduledTask.create({
          data: {
            serverId: targetServerId,
            action: t.action,
            cronExpression: t.cronExpression,
            enabled: t.enabled,
            broadcastMsg: t.broadcastMsg,
            broadcastMin: t.broadcastMin
          }
        });
      }
    }

    // Delete the temp file
    fs.unlinkSync(tempFile);

    return NextResponse.json({ success: true, serverId: targetServerId });

  } catch (err: any) {
    console.error(err);
    return new NextResponse(err.message, { status: 500 });
  }
}
