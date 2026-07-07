import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { z } from "zod";
import parser from "cron-parser";

// GET /api/servers/[id]/automations
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

// POST /api/servers/[id]/automations
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Requires ADMIN role" }, { status: 403 });

    const automationSchema = z.object({
      name: z.string().min(1, "Name is required"),
      enabled: z.boolean().default(true),
      triggerType: z.enum(["CRON", "ONE_TIME", "SERVER_CRASH", "DAILY"]),
      triggerConfig: z.any().optional(),
      actions: z.array(z.object({
        type: z.string(),
        config: z.any().optional()
      })).min(1, "At least one action is required"),
      conditions: z.array(z.object({
        type: z.string(),
        operator: z.string(),
        value: z.string()
      })).optional()
    });

    const body = await req.json();
    const parsed = automationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
    }

    const { name, enabled, triggerType, triggerConfig, actions, conditions } = parsed.data;

    let nextRunAt: Date | undefined;
    if (triggerType === "CRON" && triggerConfig && triggerConfig.expression) {
      try {
        const interval = parser.parse(triggerConfig.expression);
        nextRunAt = interval.next().toDate();
      } catch (err) {
        return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
      }
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
