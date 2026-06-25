import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import cronParser from "cron-parser";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const body = await req.json();
    
    if (body.cronExpression) {
      try {
        cronParser.parseExpression(body.cronExpression);
      } catch (e) {
        return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
      }
    }

    const updatedTask = await prisma.scheduledTask.update({
      where: { id: params.taskId, serverId: params.id },
      data: {
        enabled: body.enabled !== undefined ? body.enabled : undefined,
        cronExpression: body.cronExpression,
        broadcastMsg: body.broadcastMsg !== undefined ? body.broadcastMsg : undefined,
        broadcastMin: body.broadcastMin !== undefined ? body.broadcastMin : undefined
      }
    });

    return NextResponse.json(updatedTask);
  } catch (error: any) {
    console.error("PUT /schedules/[taskId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    await prisma.scheduledTask.delete({
      where: { id: params.taskId, serverId: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /schedules/[taskId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
