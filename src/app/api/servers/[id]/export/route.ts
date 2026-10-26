import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import path from "path";
import * as tar from "tar";
import fs from "fs";
import { Readable, PassThrough } from "stream";
import { requireLocalServer } from "@/lib/agents/perimeter";
import { stageAgentServerTree } from "@/lib/agents/agentWorlds";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const server = await prisma.server.findUnique({
      where: { id: params.id, userId: session.id },
      include: {
        mods: true,
        automations: {
          include: {
            actions: true,
            conditions: true
          }
        },
      }
    });

    if (!server) return new NextResponse("Server not found", { status: 404 });

    // A GET must never stop a running server as a side effect (a prefetch or
    // link preview could kill someone's session). Export requires a stopped
    // server, same as backup restore.
    if (server.status === "RUNNING" || server.status === "STARTING") {
      return new NextResponse("Stop the server before exporting it.", { status: 409 });
    }
    if (server.runnerType !== "AGENT") {
      requireLocalServer(server, "World export");
    }

    const dataDir = process.env.GAMEVAULT_DATA_DIR || process.cwd();
    const serverPath = server.localPath || path.join(dataDir, "local-servers", server.id);

    // AGENT servers: the tree lives on the node — stage it here via the
    // backup upload pipeline, then treat the staging dir as serverPath.
    let stagedDir: string | null = null;
    if (server.runnerType === "AGENT") {
      stagedDir = await stageAgentServerTree(server.id);
    }
    const exportRoot = stagedDir ?? serverPath;

    if (!fs.existsSync(exportRoot)) {
      fs.mkdirSync(exportRoot, { recursive: true });
    }

    // Write realm.json
    const realmJsonPath = path.join(exportRoot, "realm.json");
    const manifest = {
      formatVersion: 1,
      exportDate: new Date().toISOString(),
      server: {
        name: server.name,
        game: server.game,
        ramAllocation: server.ramAllocation,
        // Secrets never ride in the manifest — imports prompt for a fresh
        // password (the import route treats a missing password as null).
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
      automations: server.automations.map((a: any) => ({
        name: a.name,
        enabled: a.enabled,
        triggerType: a.triggerType,
        triggerConfig: a.triggerConfig,
        actions: a.actions.map((act: any) => ({
          type: act.type,
          order: act.order,
          config: act.config
        })),
        conditions: a.conditions.map((cond: any) => ({
          type: cond.type,
          operator: cond.operator,
          value: cond.value
        }))
      }))
    };

    fs.writeFileSync(realmJsonPath, JSON.stringify(manifest, null, 2));

    const cleanup = () => {
      try { if (fs.existsSync(realmJsonPath)) fs.unlinkSync(realmJsonPath); } catch { /* best-effort */ }
      if (stagedDir) {
        try { fs.rmSync(stagedDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    };

    const tarStream = tar.c({
      gzip: true,
      cwd: exportRoot,
    }, ["."]);

    tarStream.on("end", cleanup);
    tarStream.on("error", cleanup);

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
    console.error("EXPORT ROUTE ERROR:", err);
    return new NextResponse(err.message || "Unknown error", { status: 500 });
  }
}