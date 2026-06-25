import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serverEventBus } from "@/lib/eventBus";
import { formatSseEvent, SSE_HEARTBEAT } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all servers the user has access to
  const servers = await prisma.server.findMany({
    where: {
      OR: [
        { userId: user.id }, // Owner
        {
          collaborators: {
            some: { userId: user.id } // Team member
          }
        }
      ]
    },
    select: { id: true }
  });
  
  const allowedServerIds = new Set(servers.map(s => s.id));

  const encoder = new TextEncoder();
  const ac = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval>;

      const send = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* controller already closed */
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        
        serverEventBus.off("stats_update", onStatsUpdate);
        serverEventBus.off("status_update", onStatusUpdate);
        
        ac.abort();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);

      heartbeat = setInterval(() => send(SSE_HEARTBEAT), 15000);

      const onStatsUpdate = (data: { serverId: string; cpu: number; memory: number }) => {
        if (allowedServerIds.has(data.serverId)) {
          send(formatSseEvent(JSON.stringify({ type: "stats", ...data })));
        }
      };

      const onStatusUpdate = (data: { serverId: string; status?: string; healthStatus?: string }) => {
        if (allowedServerIds.has(data.serverId)) {
          send(formatSseEvent(JSON.stringify({ type: "status", ...data })));
        }
      };

      serverEventBus.on("stats_update", onStatsUpdate);
      serverEventBus.on("status_update", onStatusUpdate);
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
