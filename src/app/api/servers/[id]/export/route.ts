import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRunner } from "@/lib/runners/factory";
import path from "path";
import * as tar from "tar";
import fs from "fs";
import { Readable, PassThrough } from "stream";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const server = await prisma.server.findUnique({
      where: { id: params.id, userId: session.id },
      include: {
        mods: true,
        scheduledTasks: true,
      }
    });

    if (!server) return new NextResponse("Server not found", { status: 404 });

    const runner = getRunner(server.runnerType);
    if (server.status === "RUNNING") {
      await runner.stop(server);
      await prisma.server.update({ where: { id: server.id }, data: { status: "STOPPED" } });
    }

    const dataDir = process.env.GAMEVAULT_DATA_DIR || process.cwd();
    const serverPath = server.localPath || path.join(dataDir, "local-servers", server.id);

    if (!fs.existsSync(serverPath)) {
      return new NextResponse("Server files not found", { status: 404 });
    }

    // Write realm.json
    const realmJsonPath = path.join(serverPath, "realm.json");
    const manifest = {
      formatVersion: 1,
      exportDate: new Date().toISOString(),
      server: {
        name: server.name,
        game: server.game,
        ramAllocation: server.ramAllocation,
        password: server.password,
        port: server.port,
        paramValues: server.paramValues ? JSON.parse(server.paramValues) : null,
      },
      mods: server.mods.map((m: any) => ({
        provider: m.provider,
        packageId: m.packageId,
        version: m.version,
        name: m.name,
        dependencies: m.dependencies
      })),
      tasks: server.scheduledTasks.map((t: any) => ({
        action: t.action,
        cronExpression: t.cronExpression,
        enabled: t.enabled,
        broadcastMsg: t.broadcastMsg,
        broadcastMin: t.broadcastMin
      }))
    };

    fs.writeFileSync(realmJsonPath, JSON.stringify(manifest, null, 2));

    const tarStream = tar.c({
      gzip: true,
      cwd: serverPath,
    }, ["."]);

    tarStream.on("end", () => {
      if (fs.existsSync(realmJsonPath)) fs.unlinkSync(realmJsonPath);
    });
    tarStream.on("error", () => {
      if (fs.existsSync(realmJsonPath)) fs.unlinkSync(realmJsonPath);
    });

    const passThrough = new PassThrough();
    tarStream.pipe(passThrough);

    // We can cast the Node stream to any or use Readable.toWeb
    const webStream = Readable.toWeb(passThrough as any);

    const filename = `${server.name.replace(/[^a-zA-Z0-9]/g, "_")}.realm`;

    return new NextResponse(webStream as any, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/x-gzip",
      }
    });

  } catch (err: any) {
    console.error(err);
    return new NextResponse(err.message, { status: 500 });
  }
}
