import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { startTunnel, stopTunnel } from "@/lib/tunnels";
import * as crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSpec, parseParamValues, stringifyParamValues } from "@/lib/definitions/serialize";
import { validateParamValues } from "@/lib/definitions/validate";
import { assembleSettingsFields } from "@/lib/definitions/settings";
import { buildContext } from "@/lib/definitions/context";
import { applyConfigFiles } from "@/lib/definitions/applyConfigFiles";
import { buildAgentConfigEntries, configInstallSubDir } from "@/lib/runners/docker/planLaunch";
import { agentApplyConfigFiles } from "@/lib/agents/agentFiles";
import { dataRoot } from "@/lib/appPaths";

async function resolveSpec(server: { definitionId: string | null; game: string }) {
  const def = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  return def ? { def, spec: parseSpec(def.spec) } : null;
}

// GET: game settings schema for this server — declared params (with metadata)
// merged with the stored values, so the dashboard can render a typed form.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const { server } = access;
    const resolved = await resolveSpec(server);
    if (!resolved) return NextResponse.json({ error: "Unsupported game" }, { status: 400 });

    const stored = parseParamValues(server.paramValues);
    return NextResponse.json({
      game: resolved.def.displayName,
      status: server.status,
      fields: assembleSettingsFields(resolved.spec.params, stored),
      // Games whose definitions declare no params have no structured settings
      // (yet); the raw config editor remains the escape hatch for them.
      supportsSettings: resolved.spec.params.length > 0,
    });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/settings error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// PUT: validate + persist game setting values. While the server is stopped and
// installed, managed config files are re-rendered immediately so changes take
// effect without waiting for the next start; while running, values persist and
// apply at next start (launch args are rendered from these values at start).
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });

    const { server } = access;
    const resolved = await resolveSpec(server);
    if (!resolved) return NextResponse.json({ error: "Unsupported game" }, { status: 400 });
    const { spec } = resolved;

    const bodySchema = z.object({
      paramValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
    }

    // Merge onto defaults + previously stored values so partial updates and
    // pre-existing empty stores validate against the full effective set.
    const stored = parseParamValues(server.paramValues);
    const effective = {
      ...Object.fromEntries(spec.params.flatMap((p) => (p.default !== undefined ? [[p.key, p.default] as const] : []))),
      ...stored,
      ...parsed.data.paramValues,
    };
    const errors = validateParamValues(spec.params, effective);
    if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

    // Unknown keys are dropped by taking only declared params from the merge.
    const clean = Object.fromEntries(
      spec.params.map((p) => [p.key, effective[p.key]])
    ) as Record<string, string | number | boolean>;

    const isRunning = server.status === "RUNNING" || server.status === "STARTING";
    const previous = Object.fromEntries(
      spec.params.map((p) => [p.key, p.key in stored ? stored[p.key] : p.default ?? ""])
    ) as Record<string, string | number | boolean>;
    const valuesChanged = spec.params.some((p) => String(previous[p.key] ?? "") !== String(clean[p.key] ?? ""));
    await prisma.server.update({
      where: { id: server.id },
      data: {
        paramValues: stringifyParamValues(clean),
        // Applied immediately below when stopped; while running the values ride
        // along until the next start — surface that on the server card.
        pendingRestart: isRunning && valuesChanged ? true : isRunning ? server.pendingRestart : false,
      },
    });

    let appliedNow = false;
    if (!isRunning && spec.configFiles.length > 0) {
      const ctx = buildContext({
        name: server.name,
        password: server.password,
        port: server.port,
        ram: server.ramAllocation,
        paramValuesJson: stringifyParamValues(clean),
        spec,
      });
      if (server.runnerType === "AGENT") {
        // The files live on the node — apply the rendered set there in one
        // command (merge-preserving, same semantics as the START payload).
        await agentApplyConfigFiles(
          server.id,
          buildAgentConfigEntries(spec, ctx, { name: server.name, password: server.password })
        );
        appliedNow = true;
      } else {
        const serverRoot = path.join(dataRoot(), "local-servers", server.id);
        if (fs.existsSync(serverRoot)) {
          // Config file paths are install-dir-relative — target the install
          // subdir like the runners do (games with a subdir used to get
          // their settings written next to it, unread).
          const subDir = configInstallSubDir(spec, ctx);
          const installDir = subDir ? path.join(serverRoot, subDir) : serverRoot;
          applyConfigFiles(spec, ctx, {
            installDir,
            server: { name: server.name, password: server.password },
          });
          appliedNow = true;
        }
      }
    }

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_SETTINGS",
        details: `Updated game settings for server '${server.name}' (${resolved.def.displayName}).`,
      },
    });

    return NextResponse.json({
      success: true,
      appliedNow,
      message: appliedNow
        ? "Settings saved and applied to config files."
        : "Settings saved. They take effect the next time the server starts.",
    });
  } catch (error: any) {
    console.error("PUT /api/servers/[id]/settings error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Requires ADMIN role" }, { status: 403 });

    const { server } = access;
    const body = await req.json();

    if (body.action === "TOGGLE_TUNNEL") {
      const enable = !!body.enable;
      
      const updated = await prisma.server.update({
        where: { id: server.id },
        data: { tunnelEnabled: enable }
      });

      if (enable && server.status === "RUNNING") {
        // Await and report: an unconfigured/failed spawn used to return
        // success unconditionally while the UI claimed friends could join.
        const result = await startTunnel(server.id, server.port);
        if (!result.ok) {
          await prisma.server.update({
            where: { id: server.id },
            data: { tunnelEnabled: false }
          });
          return NextResponse.json({ success: false, error: `Tunnel failed to start: ${result.error}` }, { status: 500 });
        }
      } else if (!enable) {
        // stopTunnel clears tunnelUrl/claimUrl/pid itself
        await stopTunnel(server.id);
      }

      return NextResponse.json({ success: true, tunnelEnabled: enable });
    }

    if (body.action === "TOGGLE_AUTO_UPDATE") {
      const enable = !!body.enable;
      
      const updated = await prisma.server.update({
        where: { id: server.id },
        data: { autoUpdate: enable }
      });

      return NextResponse.json({ success: true, autoUpdate: enable });
    }

    if (body.action === "SET_UPDATE_HOUR") {
      const hour = Number(body.hour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return NextResponse.json({ error: "hour must be an integer between 0 and 23" }, { status: 400 });
      }
      await prisma.server.update({
        where: { id: server.id },
        data: { autoUpdateHour: hour }
      });
      return NextResponse.json({ success: true, autoUpdateHour: hour });
    }

    if (body.action === "SET_AUTO_START_LEAD") {
      const minutes = Number(body.minutes);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 120) {
        return NextResponse.json({ error: "minutes must be an integer between 0 and 120" }, { status: 400 });
      }
      await prisma.server.update({
        where: { id: server.id },
        data: { autoStartLeadMinutes: minutes }
      });
      return NextResponse.json({ success: true, autoStartLeadMinutes: minutes });
    }

    if (body.action === "TOGGLE_IDLE_STOP") {
      const enable = !!body.enable;
      const minutes = Number(body.minutes ?? server.idleStopMinutes ?? 30);
      if (!Number.isInteger(minutes) || minutes < 10 || minutes > 240) {
        return NextResponse.json({ error: "minutes must be an integer between 10 and 240" }, { status: 400 });
      }
      await prisma.server.update({
        where: { id: server.id },
        data: { idleStopEnabled: enable, idleStopMinutes: minutes }
      });
      return NextResponse.json({ success: true, idleStopEnabled: enable, idleStopMinutes: minutes });
    }

    if (body.action === "SET_SESSION_AUTO_STOP") {
      const hours = Number(body.hours);
      if (!Number.isInteger(hours) || hours < 0 || hours > 48) {
        return NextResponse.json({ error: "hours must be an integer between 0 and 48 (0 = off)" }, { status: 400 });
      }
      await prisma.server.update({
        where: { id: server.id },
        data: { sessionAutoStopHours: hours }
      });
      return NextResponse.json({ success: true, sessionAutoStopHours: hours });
    }

    if (body.action === "REGENERATE_SFTP") {
      const newPass = crypto.randomBytes(8).toString("hex");
      const updated = await prisma.server.update({
        where: { id: server.id },
        data: { sftpPassword: newPass }
      });
      return NextResponse.json({ success: true, sftpPassword: newPass });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
