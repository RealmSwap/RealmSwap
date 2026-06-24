import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stopLocalServer } from "@/lib/localRunner";
import { stopAllRunningServers } from "./stopAll";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-internal-token");
  if (!token || token !== process.env.GAMEVAULT_INTERNAL_TOKEN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const stopped = await stopAllRunningServers(
    async () => {
      const rows = await prisma.server.findMany({
        where: { runnerType: "LOCAL", status: { in: ["RUNNING", "STARTING", "UPDATING"] } },
        select: { id: true },
      });
      return rows;
    },
    (id) => stopLocalServer(id)
  );

  return NextResponse.json({ stopped });
}
