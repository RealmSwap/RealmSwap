import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRunner } from "@/lib/runners";
import { stopAllRunningServers } from "./stopAll";
import { stopRealmSyncServer } from "@/lib/realmSyncHost";
import { stopAllTunnels } from "@/lib/tunnels";
import { secureSecretEquals } from "@/lib/secureCompare";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-internal-token");
  if (!secureSecretEquals(process.env.GAMEVAULT_INTERNAL_TOKEN, token)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const stopped = await stopAllRunningServers(
    async () => {
      const rows = await prisma.server.findMany({
        where: { status: { in: ["RUNNING", "STARTING", "UPDATING"] } },
        select: { id: true, runnerType: true },
      });
      return rows;
    },
    async (row: any) => {
      const runner = getRunner(row.runnerType);
      const fullServer = await prisma.server.findUnique({ where: { id: row.id } });
      if (fullServer) {
        await runner.stop(fullServer);
      }
    }
  );

  // Release the RealmSync listener + its UPnP mapping and every playit tunnel
  // so nothing the app spawned outlives it with stale state on disk.
  try {
    await stopRealmSyncServer();
  } catch (err) {
    console.error("[Shutdown] Failed to stop RealmSync server:", err);
  }
  try {
    await stopAllTunnels();
  } catch (err) {
    console.error("[Shutdown] Failed to stop tunnels:", err);
  }

  return NextResponse.json({ stopped });
}
