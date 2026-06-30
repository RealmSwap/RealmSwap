import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRunner } from "@/lib/runners/factory";
import { serverEventBus } from "@/lib/eventBus";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.DISCORD_BOT_TOKEN}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, serverId } = await req.json();

    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const runner = getRunner(server.runnerType);

    const updateStatus = async (status: string) => {
      await prisma.server.update({ where: { id: server.id }, data: { status } });
      serverEventBus.emit("status_update", { serverId: server.id, status });
    };

    if (action === "start") {
      await updateStatus("STARTING");
      await runner.start(server, null as any);
      await updateStatus("RUNNING");
    } else if (action === "stop") {
      await runner.stop(server);
      await updateStatus("STOPPED");
    } else if (action === "restart") {
      await runner.stop(server);
      await updateStatus("STARTING");
      await runner.start(server, null as any);
      await updateStatus("RUNNING");
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Bot API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
