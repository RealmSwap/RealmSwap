import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRunner } from "@/lib/runners";
import { stopAllRunningServers } from "./stopAll";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-internal-token");
  if (!token || token !== process.env.GAMEVAULT_INTERNAL_TOKEN) {
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

  return NextResponse.json({ stopped });
}
