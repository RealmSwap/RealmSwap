import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { computeNextRunAt } from "@/lib/automations/schedule";
import { automationUpdateSchema } from "@/lib/automations/schemas";
import { TriggerConfig, TriggerType } from "@/lib/automations/types";

export async function GET(
  request: Request,
  { params }: { params: { id: string; automationId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "VIEWER");
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Requires ADMIN role" }, { status: 403 });

    const existing = await prisma.automation.findUnique({
      where: { id: params.automationId, serverId: params.id }
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const parsed = automationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: `Invalid payload: ${parsed.error.issues[0]?.message ?? "check field values"}`,
        details: parsed.error.format(),
      }, { status: 400 });
    }

    const { name, enabled, triggerType, triggerConfig, actions, conditions } = parsed.data;

    // Recompute the schedule when the trigger changes, and when an automation
    // is re-enabled — rows saved before schedules were computed have a null
    // nextRunAt the engine would otherwise skip forever.
    let nextRunAt: Date | null | undefined;
    if (triggerType !== undefined || triggerConfig !== undefined || enabled === true) {
      const mergedType = (triggerType ?? existing.triggerType) as TriggerType;
      let mergedConfig: TriggerConfig = {};
      try {
        mergedConfig = triggerConfig ?? (existing.triggerConfig ? JSON.parse(existing.triggerConfig) : {});
      } catch {
        mergedConfig = {};
      }
      try {
        nextRunAt = computeNextRunAt(mergedType, mergedConfig);
      } catch (err: any) {
        return NextResponse.json({ error: err.message || "Invalid trigger configuration" }, { status: 400 });
      }
    }

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
        ...(nextRunAt !== undefined && { nextRunAt }),
        ...(actions && {
          actions: {
            create: actions.map((a, i: number) => ({
              type: a.type,
              order: i,
              config: a.config ? JSON.stringify(a.config) : null,
            }))
          }
        }),
        ...(conditions && {
          conditions: {
            create: conditions.map((c) => ({
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
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Requires ADMIN role" }, { status: 403 });

    await prisma.automation.delete({
      where: { id: params.automationId, serverId: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
