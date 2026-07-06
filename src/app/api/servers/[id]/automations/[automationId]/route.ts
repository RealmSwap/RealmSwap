import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string; automationId: string } }
) {
  try {
    const automation = await prisma.automation.findUnique({
      where: { id: params.automationId, serverId: params.id },
      include: {
        actions: { orderBy: { order: "asc" } },
        conditions: true,
        executions: { orderBy: { startedAt: "desc" }, take: 10 }
      }
    });
    if (!automation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(automation);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string; automationId: string } }
) {
  try {
    const body = await request.json();
    const { name, enabled, triggerType, triggerConfig, actions, conditions } = body;

    // Delete existing actions/conditions and recreate them if provided
    if (actions) {
      await prisma.automationAction.deleteMany({ where: { automationId: params.automationId } });
    }
    if (conditions) {
      await prisma.automationCondition.deleteMany({ where: { automationId: params.automationId } });
    }

    const automation = await prisma.automation.update({
      where: { id: params.automationId, serverId: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(enabled !== undefined && { enabled }),
        ...(triggerType !== undefined && { triggerType }),
        ...(triggerConfig !== undefined && { triggerConfig: JSON.stringify(triggerConfig) }),
        ...(actions && {
          actions: {
            create: actions.map((a: any, i: number) => ({
              type: a.type,
              order: i,
              config: a.config ? JSON.stringify(a.config) : null,
            }))
          }
        }),
        ...(conditions && {
          conditions: {
            create: conditions.map((c: any) => ({
              type: c.type,
              operator: c.operator,
              value: c.value
            }))
          }
        })
      },
      include: {
        actions: { orderBy: { order: "asc" } },
        conditions: true
      }
    });

    return NextResponse.json(automation);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; automationId: string } }
) {
  try {
    await prisma.automation.delete({
      where: { id: params.automationId, serverId: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
