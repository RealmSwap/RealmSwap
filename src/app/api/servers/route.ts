import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { initBackupScheduler } from "@/lib/backupScheduler";
import { parseSpec, stringifyParamValues } from "@/lib/definitions/serialize";
import { validateParamValues } from "@/lib/definitions/validate";

// GET /api/servers
// Returns active servers, archived servers, subscription details, and logs
export async function GET(req: NextRequest) {
  try {
    initBackupScheduler();
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [servers, archives, logs] = await Promise.all([
      prisma.server.findMany({
        where: {
          OR: [
            { userId: user.id },
            { collaborators: { some: { userId: user.id } } }
          ]
        },
        include: {
          collaborators: {
            include: {
              user: {
                select: { name: true, email: true }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.archive.findMany({
        where: { userId: user.id },
        orderBy: { archivedAt: "desc" },
      }),
      prisma.activityLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      servers,
      archives,
      activityLogs: logs,
    });
  } catch (error) {
    console.error("GET /api/servers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/servers
// Creates a new active server, checking active slot limits
export async function POST(req: NextRequest) {
  try {
    initBackupScheduler();
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, definitionId, ramAllocation, password, enableUpnp, paramValues } = await req.json();
    if (!name || !definitionId || !ramAllocation) {
      return NextResponse.json({ error: "Name, definition, and RAM allocation are required" }, { status: 400 });
    }

    const def = await prisma.gameDefinition.findFirst({
      where: { id: definitionId, OR: [{ ownerId: null }, { ownerId: user.id }] },
    });
    if (!def) return NextResponse.json({ error: "Game definition not found" }, { status: 404 });

    const spec = parseSpec(def.spec);

    // password policy validation (e.g. Valheim min length) using the spec
    if (spec.passwordPolicy?.minLength && spec.passwordPolicy.fallback === undefined) {
      if (!password || password.length < spec.passwordPolicy.minLength) {
        return NextResponse.json({ error: `${def.displayName} requires a password of at least ${spec.passwordPolicy.minLength} characters` }, { status: 400 });
      }
    }

    const paramErrors = validateParamValues(spec.params, paramValues ?? {});
    if (paramErrors.length) return NextResponse.json({ error: paramErrors.join(" ") }, { status: 400 });

    const runnerType = "LOCAL";
    const region = "LOCALHOST";
    const ipAddress = "127.0.0.1";
    const port = spec.defaultPort;

    const newServer = await prisma.server.create({
      data: {
        userId: user.id,
        name,
        game: def.slug,
        definitionId: def.id,
        paramValues: stringifyParamValues(paramValues ?? {}),
        ramAllocation: parseFloat(ramAllocation),
        region,
        status: "STOPPED", // Server starts stopped, user can turn it on
        runnerType,
        ipAddress,
        port,
        password: password || null,
        enableUpnp: !!enableUpnp,
        cpuUsage: 0,
        memoryUsage: 0,
      },
    });

    // Create activity log
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "CREATE_SERVER",
        details: `Deployed new local ${def.slug} server '${name}' (${ramAllocation}GB RAM).`,
      },
    });

    return NextResponse.json(newServer, { status: 201 });
  } catch (error) {
    console.error("POST /api/servers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
