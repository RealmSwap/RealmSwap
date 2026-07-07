import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRunner } from "@/lib/runners/factory";
import { serverEventBus } from "@/lib/eventBus";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const botActionSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
  serverId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limit (e.g. 10 requests per minute per IP/source)
    const ip = req.headers.get("x-forwarded-for") || req.ip || "unknown_ip";
    if (!checkRateLimit(`bot_action_${ip}`, { limit: 10, windowMs: 60000 })) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.DISCORD_BOT_TOKEN}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const result = botActionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid request payload", details: result.error.format() }, { status: 400 });
    }

    const { action, serverId } = result.data;

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
