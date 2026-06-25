import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import cronParser from "cron-parser";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const schedules = await prisma.scheduledTask.findMany({
      where: { serverId: params.id },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(schedules);
  } catch (error: any) {
    console.error("GET /schedules error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const body = await req.json();
    const { action, cronExpression, broadcastMsg, broadcastMin } = body;

    if (!["START", "STOP", "RESTART"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    try {
      cronParser.parseExpression(cronExpression);
    } catch (e) {
      return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
    }

    const newTask = await prisma.scheduledTask.create({
      data: {
        serverId: params.id,
        action,
        cronExpression,
        broadcastMsg: broadcastMsg || null,
        broadcastMin: broadcastMin ? parseInt(broadcastMin, 10) : null
      }
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_SERVER",
        details: `Added new scheduled task (${action}) on server '${access.server.name}'.`,
      },
    }).catch(() => {});

    return NextResponse.json(newTask, { status: 201 });
  } catch (error: any) {
    console.error("POST /schedules error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
