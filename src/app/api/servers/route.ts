import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { initBackupScheduler } from "@/lib/backupScheduler";
import { initActionScheduler } from "@/lib/actionScheduler";
import { parseSpec, stringifyParamValues } from "@/lib/definitions/serialize";
import { validateParamValues } from "@/lib/definitions/validate";
import { isPortAvailable, getFreeDiskSpaceGB, isSteamCmdInstalled } from "@/lib/preflight";
import { dataRoot } from "@/lib/appPaths";
import { resolveRunnerType } from "@/lib/runners/resolveRunnerType";
import { isDockerAvailable } from "@/lib/runners/docker/dockerCli";

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

    const { name, definitionId, ramAllocation, password, enableUpnp, paramValues, runnerType: requestedRunner } = await req.json();
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

    const port = spec.defaultPort;

    // --- Pre-flight Validations ---

    // 1. Check Port Availability
    const portFree = await isPortAvailable(port);
    if (!portFree) {
      return NextResponse.json({ error: `Port ${port} is currently in use by another application. Please stop the application or change the port.` }, { status: 400 });
    }

    // 2. SteamCMD Check & Disk Space Check
    if ('appId' in spec.install) {
      // It's a SteamCMD install
      // 3. Disk Space Check (Requires at least 250MB for SteamCMD + game size)
      const requiredGB = spec.install.requiredDiskGB || 0;
      const totalRequiredGB = Math.max(requiredGB, 0.25);
      const freeSpaceGB = await getFreeDiskSpaceGB(dataRoot());

      if (freeSpaceGB < totalRequiredGB) {
        return NextResponse.json({ 
          error: `Insufficient disk space. You have ${freeSpaceGB.toFixed(2)} GB free, but deploying this server requires at least ${totalRequiredGB} GB.` 
        }, { status: 400 });
      }
    } else {
      // Non-SteamCMD install disk check (fallback to checking at least 1GB if not specified)
      const freeSpaceGB = await getFreeDiskSpaceGB(dataRoot());
      if (freeSpaceGB < 1) {
        return NextResponse.json({ 
          error: `Insufficient disk space. You have ${freeSpaceGB.toFixed(2)} GB free, but deploying requires at least 1.00 GB.` 
        }, { status: 400 });
      }
    }
    // --- End Pre-flight Validations ---

    const hasContainer = !!spec.container;
    const dockerAvailable = requestedRunner === "DOCKER" ? await isDockerAvailable() : false;
    const runnerType = resolveRunnerType(requestedRunner, { hasContainer, dockerAvailable });
    if (requestedRunner === "DOCKER" && runnerType !== "DOCKER") {
      return NextResponse.json(
        { error: "Docker runtime is unavailable or unsupported for this game. Ensure Docker is running and the game supports containers." },
        { status: 400 },
      );
    }
    const region = "LOCALHOST";
    const ipAddress = "127.0.0.1";

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
        details: `Deployed new ${runnerType === "DOCKER" ? "containerized" : "local"} ${def.slug} server '${name}' (${ramAllocation}GB RAM).`,
      },
    });

    return NextResponse.json(newServer, { status: 201 });
  } catch (error) {
    console.error("POST /api/servers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
