import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { computeNextRunAt } from "@/lib/automations/schedule";
import { automationCreateSchema } from "@/lib/automations/schemas";
import { TriggerConfig, TriggerType } from "@/lib/automations/types";

// GET /api/servers/[id]/automations
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "VIEWER");
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const automations = await prisma.automation.findMany({
      where: { serverId: params.id },
      include: {
        actions: { orderBy: { order: "asc" } },
        conditions: true,
        executions: {
          orderBy: { startedAt: "desc" },
          take: 10
        }
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(automations);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/servers/[id]/automations
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Requires ADMIN role" }, { status: 403 });

    const body = await req.json();
    const parsed = automationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: `Invalid payload: ${parsed.error.issues[0]?.message ?? "check field values"}`,
        details: parsed.error.format(),
      }, { status: 400 });
    }

    const { name, enabled, triggerType, triggerConfig, actions, conditions } = parsed.data;

    // Every scheduled type gets a real nextRunAt or the save is rejected —
    // a schedule the engine can't honor must never be stored silently.
    let nextRunAt: Date | null = null;
    try {
      nextRunAt = computeNextRunAt(triggerType as TriggerType, (triggerConfig ?? {}) as TriggerConfig);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid trigger configuration" }, { status: 400 });
    }

    const automation = await prisma.automation.create({
      data: {
        serverId: params.id,
        name,
        enabled,
        triggerType,
        triggerConfig: triggerConfig ? JSON.stringify(triggerConfig) : null,
        nextRunAt,
        actions: {
          create: actions.map((a, idx) => ({
            type: a.type,
            config: a.config ? JSON.stringify(a.config) : null,
            order: idx
          }))
        },
        conditions: {
          create: conditions?.map((c) => ({
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

    return NextResponse.json(automation, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
