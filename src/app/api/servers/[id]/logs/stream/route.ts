import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { streamServerLog } from "@/lib/logTailer";
import { formatSseEvent, SSE_HEARTBEAT } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }
  const { server } = access;

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
        ac.abort();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Client disconnect (modal closed / navigated away)
      req.signal.addEventListener("abort", close);

      heartbeat = setInterval(() => send(SSE_HEARTBEAT), 15000);

      if (server.runnerType === "LOCAL" || server.runnerType === "DOCKER") {
        (async () => {
          try {
            for await (const lines of streamServerLog(server.id, {
              signal: ac.signal,
            })) {
              if (ac.signal.aborted) break;
              if (lines.length === 0) continue;
              send(formatSseEvent(lines.join("\n")));
            }
          } catch (err: any) {
            send(
              formatSseEvent(`Log stream error: ${err?.message ?? "unknown"}`, {
                event: "error",
              })
            );
          } finally {
            close();
          }
        })();
      } else {
        // Cloud runner has no local process; send a one-time notice and keep
        // the connection alive via heartbeats until the client disconnects.
        const note =
          server.status === "RUNNING"
            ? `Cloud runner '${server.name}' is running. Live console is available for local servers only.`
            : "Server is offline. Press Start to boot the server instance.";
        send(formatSseEvent(note));
      }
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
