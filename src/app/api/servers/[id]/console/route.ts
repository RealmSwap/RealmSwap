import { NextRequest, NextResponse } from "next/server";
import { serverLogs, logEmitter } from "@/lib/logStreamer";
import { localProcesses } from "@/lib/localRunner";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const serverId = params.id;

  const stream = new ReadableStream({
    start(controller) {
      // Send historical logs first
      const history = serverLogs.get(serverId) || [];
      for (const line of history) {
        // SSE format
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'log', text: line })}\n\n`));
      }

      // Listen for new logs
      const listener = (msg: string) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'log', text: msg })}\n\n`));
      };
      
      logEmitter.on(`log:${serverId}`, listener);

      // Cleanup on disconnect
      req.signal.addEventListener("abort", () => {
        logEmitter.off(`log:${serverId}`, listener);
        controller.close();
      });
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const serverId = params.id;
    const body = await req.json();
    const { command } = body;

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "Invalid command" }, { status: 400 });
    }

    const child = localProcesses.get(serverId);
    if (!child) {
      return NextResponse.json({ error: "Server is not running locally or process not found." }, { status: 400 });
    }

    if (!child.stdin) {
      return NextResponse.json({ error: "Server process does not accept stdin input." }, { status: 400 });
    }

    // Write command to process stdin with newline
    child.stdin.write(command + "\n");
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
