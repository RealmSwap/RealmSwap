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
import { dataRoot } from "@/lib/appPaths";

async function resolveSpec(server: { definitionId: string | null; game: string }) {
  const def = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  return def ? { def, spec: parseSpec(def.spec) } : null;
}

// GET: game settings schema for this server — declared params (with metadata)
// merged with the stored values, so the dashboard can render a typed form.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    await prisma.server.update({
      where: { id: server.id },
      data: { paramValues: stringifyParamValues(clean) },
    });

    let appliedNow = false;
    if (server.status !== "RUNNING" && server.status !== "STARTING" && spec.configFiles.length > 0) {
      const serverRoot = path.join(dataRoot(), "local-servers", server.id);
      if (fs.existsSync(serverRoot)) {
        const ctx = buildContext({
          name: server.name,
          password: server.password,
          port: server.port,
          ram: server.ramAllocation,
          paramValuesJson: stringifyParamValues(clean),
          spec,
        });
        applyConfigFiles(spec, ctx, {
          installDir: serverRoot,
          server: { name: server.name, password: server.password },
        });
        appliedNow = true;
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

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
        startTunnel(server.id, server.port);
      } else if (!enable) {
        stopTunnel(server.id);
        await prisma.server.update({
          where: { id: server.id },
          data: { tunnelUrl: null }
        });
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
