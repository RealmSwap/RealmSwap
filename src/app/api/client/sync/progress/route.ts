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
  if (!task) {
    return new Response("Task not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const sendUpdate = () => {
        const payload = JSON.stringify({
          status: task.status,
          percent: task.percent,
          done: task.isDone,
          error: task.error
        });
        controller.enqueue(`data: ${payload}\n\n`);
        
        if (task.isDone || task.error) {
          controller.close();
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
        controller.close();
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
