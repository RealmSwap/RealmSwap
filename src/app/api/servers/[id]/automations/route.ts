import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const automations = await prisma.automation.findMany({
      where: { serverId: params.id },
      include: {
        actions: { orderBy: { order: "asc" } },
        conditions: true,
        executions: {
          orderBy: { startedAt: "desc" },
          take: 5
        }
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(automations);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, enabled, triggerType, triggerConfig, actions, conditions } = body;

    const automation = await prisma.automation.create({
      data: {
        serverId: params.id,
        name: name || "New Automation",
        enabled: enabled ?? true,
        triggerType: triggerType || "ONE_TIME",
        triggerConfig: triggerConfig ? JSON.stringify(triggerConfig) : null,
        actions: {
          create: actions?.map((a: any, i: number) => ({
            type: a.type,
            order: i,
            config: a.config ? JSON.stringify(a.config) : null,
          })) || []
        },
        conditions: {
          create: conditions?.map((c: any) => ({
            type: c.type,
            operator: c.operator,
            value: c.value
          })) || []
        }
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
