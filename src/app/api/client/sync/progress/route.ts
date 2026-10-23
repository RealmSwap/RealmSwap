import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getTask } from "@/lib/syncEngine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) {
    return new Response("Missing taskId", { status: 400 });
  }

  const task = getTask(taskId);
  if (!task || task.userId !== user.id) {
    // 404 for both: don't reveal whether a task id exists
    return new Response("Task not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed by the other path */ }
      };

      const sendUpdate = () => {
        if (closed) return;
        try {
          const payload = JSON.stringify({
            status: task.status,
            percent: task.percent,
            done: task.isDone,
            error: task.error
          });
          controller.enqueue(`data: ${payload}\n\n`);
        } catch { /* client went away */ }

        if (task.isDone || task.error) {
          safeClose();
          cleanup();
        }
      };

      const cleanup = () => {
        task.removeListener("update", sendUpdate);
      };

      task.on("update", sendUpdate);

      // Send initial state
      sendUpdate();

      req.signal.addEventListener("abort", () => {
        cleanup();
        safeClose();
      });
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
