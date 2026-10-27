import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { subscribeProgress, type ModProgressEvent } from "@/lib/mods/progress";
import { formatSseEvent, SSE_HEARTBEAT } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live progress feed for a mod operation: GET
 * /api/servers/[id]/mods/install-progress?installId=<id>
 *
 * The client generates installId before POSTing the install (or attaching it
 * to the multipart form) and opens this stream in parallel. Every subscriber
 * is auth-checked against THIS server, so the id alone grants nothing — the
 * worst a forger gets is a 403.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const installId = req.nextUrl.searchParams.get("installId") ?? "";
  if (!/^[\w-]{6,64}$/.test(installId)) {
    return NextResponse.json({ error: "A valid installId query parameter is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval>;
      let unsubscribe: (() => void) | null = null;

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
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);
      heartbeat = setInterval(() => send(SSE_HEARTBEAT), 15000);

      const onEvent = (event: ModProgressEvent) => {
        send(formatSseEvent(JSON.stringify(event), { event: "progress" }));
        if (event.stage === "done" || event.stage === "error") {
          // Let the terminal frame flush, then end the stream — EventSource
          // fires the client's done path and the browser reconnects nowhere.
          setTimeout(close, 200);
        }
      };

      unsubscribe = subscribeProgress(installId, onEvent);
      if (!unsubscribe) {
        // Unknown id: either a typo or the operation already finished and
        // aged out. Tell the client rather than hanging silently.
        send(formatSseEvent(JSON.stringify({ stage: "error", error: "No active install with that id." }), { event: "progress" }));
        setTimeout(close, 100);
        return;
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
