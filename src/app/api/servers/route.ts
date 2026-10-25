import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkServerSlot } from "@/lib/entitlement";
import { initBackupScheduler } from "@/lib/backupScheduler";
import { initActionScheduler } from "@/lib/actionScheduler";
import { ensureServerSecretsEncrypted } from "@/lib/secretsMigrate";
import { initUpdateScheduler } from "@/lib/updateScheduler";
import { parseSpec, stringifyParamValues } from "@/lib/definitions/serialize";
import { validateParamValues } from "@/lib/definitions/validate";
import { isPortAvailable, getFreeDiskSpaceGB, isSteamCmdInstalled } from "@/lib/preflight";
import { dataRoot } from "@/lib/appPaths";
import { resolveRunnerType } from "@/lib/runners/resolveRunnerType";
import { isDockerAvailable } from "@/lib/runners/docker/dockerCli";
import { summarizePlannedSession } from "@/lib/sessions";
import * as crypto from "crypto";

// GET /api/servers
// Returns active servers, archived servers, subscription details, and logs
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Background initializers run after auth so unauthenticated traffic can't
    // trigger DB writes / scheduler starts as a side effect of a GET.
    initBackupScheduler();
    ensureServerSecretsEncrypted();
    initUpdateScheduler();

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
          },
          // Next Discord-planned sessions, for the "Next session" hero chip.
          plannedSessions: {
            where: { startTime: { gte: new Date() } },
            orderBy: { startTime: "asc" },
            take: 3,
          },
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

    // Peak RAM + peak player count per server over the last 7 days, for
    // right-sizing hints. One groupBy serves both (playerCount is null on
    // most rows — the 5-min player stamps — and _max ignores nulls).
    const peaks = await prisma.serverTelemetry
      .groupBy({
        by: ["serverId"],
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        _max: { ramMB: true, playerCount: true, maxPlayers: true },
      })
      .catch(() => [] as { serverId: string; _max: { ramMB: number | null; playerCount: number | null; maxPlayers: number | null } }[]);
    const peakByServer = new Map(peaks.map((p) => [p.serverId, p._max.ramMB ?? 0]));
    const peakPlayersByServer = new Map(peaks.map((p) => [p.serverId, p._max.playerCount ?? 0]));
    const peakSlotsByServer = new Map(peaks.map((p) => [p.serverId, p._max.maxPlayers]));

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      servers: servers.map((s) => {
        const peakGB = (peakByServer.get(s.id) ?? 0) / 1024;
        let ramHint: string | null = null;
        if (peakGB > 0 && s.status === "RUNNING") {
          if (peakGB >= s.ramAllocation * 0.9) {
            ramHint = `Peaks at ${peakGB.toFixed(1)} of ${s.ramAllocation} GB — raise RAM or trim mods to avoid lag spikes.`;
          } else if (peakGB <= s.ramAllocation * 0.3) {
            ramHint = `Peaks at only ${peakGB.toFixed(1)} of ${s.ramAllocation} GB — you can free RAM by lowering the allocation.`;
          }
        }
        const peakPlayers = peakPlayersByServer.get(s.id) ?? 0;
        const peakSlots = peakSlotsByServer.get(s.id) ?? null;
        let playerHint: string | null = null;
        if (peakPlayers > 0) {
          if (peakSlots != null && peakPlayers >= peakSlots * 0.9) {
            playerHint = `Peaked at ${peakPlayers} of ${peakSlots} slots this week — close to full; consider raising max players.`;
          } else {
            playerHint = `Peaked at ${peakPlayers}${peakSlots != null ? ` of ${peakSlots}` : ""} players this week.`;
          }
        }
        // Secrets (password/rcon/sftp) never ride in the shared list payload —
        // team members see servers too. The SFTP panel fetches them per-server
        // via /api/servers/[id]/secrets (ADMIN only). Planned sessions go out
        // summarized (no raw Discord IDs in the roster JSON).
        const { password: _pw, rconPassword: _rcon, sftpPassword: _sftp, ...safe } = s;
        return {
          ...safe,
          ramHint,
          playerHint,
          plannedSessions: (s.plannedSessions ?? []).map(summarizePlannedSession),
        };
      }),
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
    ensureServerSecretsEncrypted();
    initUpdateScheduler();
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Entitlement gate: enforce the plan's active server-slot limit.
    const slot = await checkServerSlot(user.id);
    if (!slot.ok) {
      return NextResponse.json(
        {
          error: `You've reached your plan's server limit (${slot.used}/${slot.total} on the ${slot.plan} plan). Upgrade to add more slots.`,
          code: "SLOT_LIMIT",
          used: slot.used,
          total: slot.total,
          plan: slot.plan,
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    
    const serverSchema = z.object({
      name: z.string().min(1, "Server name is required").max(100),
      definitionId: z.string().min(1, "Game definition is required"),
      ramAllocation: z.number().positive("RAM allocation must be positive"),
      password: z.string().optional(),
      enableUpnp: z.boolean().optional(),
      paramValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      runnerType: z.string().optional(),
      nodeId: z.string().optional()
    });

    const parsed = serverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
    }

    const { name, definitionId, ramAllocation, password, enableUpnp, paramValues, runnerType: requestedRunner, nodeId: requestedNodeId } = parsed.data;

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

    const hasContainer = !!spec.container;
    const dockerAvailable = requestedRunner === "DOCKER" ? await isDockerAvailable() : false;
    // AGENT: the requested node must exist, belong to the requester (or the
    // requester is ADMIN), and have completed enrollment.
    let nodeEnrolled = false;
    let assignedNodeId: string | null = null;
    if (requestedRunner === "AGENT") {
      if (!requestedNodeId) {
        return NextResponse.json({ error: "A nodeId is required for the remote-node runtime." }, { status: 400 });
      }
      const node = await prisma.agentNode.findUnique({ where: { id: requestedNodeId } });
      const ownsNode = node && (node.userId === user.id || user.role === "ADMIN");
      nodeEnrolled = !!(node && ownsNode && node.status === "ACTIVE" && node.secret);
      assignedNodeId = nodeEnrolled ? node!.id : null;
    }
    const runnerType = resolveRunnerType(requestedRunner, { hasContainer, dockerAvailable, nodeEnrolled });
    if (requestedRunner === "DOCKER" && runnerType !== "DOCKER") {
      return NextResponse.json(
        { error: "Docker runtime is unavailable or unsupported for this game. Ensure Docker is running and the game supports containers." },
        { status: 400 },
      );
    }
    if (requestedRunner === "AGENT" && runnerType !== "AGENT") {
      return NextResponse.json(
        {
          error: nodeEnrolled
            ? "Remote node runtime is unavailable for this game: it has no container plan yet."
            : "Remote node runtime is unavailable: the node must exist, be enrolled, and belong to you.",
        },
        { status: 400 },
      );
    }

    // --- Pre-flight Validations ---

    // 1. Check Port Availability (dashboard machine only — remote nodes
    //    publish ports on their own host, validated by their own state)
    if (runnerType !== "AGENT") {
      const portFree = await isPortAvailable(port);
      if (!portFree) {
        return NextResponse.json({ error: `Port ${port} is currently in use by another application. Please stop the application or change the port.` }, { status: 400 });
      }
    }

    // 2. SteamCMD Check & Disk Space Check (dashboard disk only)
    if (runnerType === "AGENT") {
      // Remote node hosting: the node's own disk/RAM (reported via sync) is
      // what matters; dashboard-local checks would be meaningless.
    } else if ('appId' in spec.install) {
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

    const region = "LOCALHOST";
    const ipAddress = "127.0.0.1";

    const newServer = await prisma.server.create({
      data: {
        userId: user.id,
        name,
        game: def.slug,
        definitionId: def.id,
        paramValues: stringifyParamValues(paramValues ?? {}),
        ramAllocation,
        region,
        status: "STOPPED", // Server starts stopped, user can turn it on
        runnerType,
        nodeId: assignedNodeId,
        ipAddress,
        port,
        password: password || null,
        enableUpnp: !!enableUpnp,
        sftpPassword: crypto.randomBytes(8).toString("hex"),
        sftpPort: 2022,
        cpuUsage: 0,
        memoryUsage: 0,
      },
    });

    // Create activity log
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "CREATE_SERVER",
        details: `Deployed new ${runnerType === "AGENT" ? "remote-node" : runnerType === "DOCKER" ? "containerized" : "local"} ${def.slug} server '${name}' (${ramAllocation}GB RAM).`,
      },
    });

    return NextResponse.json(newServer, { status: 201 });
  } catch (error) {
    console.error("POST /api/servers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
