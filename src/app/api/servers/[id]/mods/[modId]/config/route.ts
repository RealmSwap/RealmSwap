import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { parseBepInExConfig, ConfigSection } from "@/lib/mods/configParser";
import { serializeBepInExConfig } from "@/lib/mods/configSerializer";
import { dataRoot } from "@/lib/appPaths";
import path from "path";
import fs from "fs";

/**
 * Find the BepInEx .cfg file that belongs to a Thunderstore package.
 * Package id → cfg filename has no reliable mapping (plugins name their own
 * cfg files at first boot), so: an exact filename-stem match wins, a UNIQUE
 * substring match is accepted, and zero or several matches refuse honestly —
 * substring guessing across several candidates would silently edit another
 * mod's config.
 */
function findConfigFile(configDir: string, packageId: string): string | null {
  if (packageId === "ValheimPlus-ValheimPlus") {
    const fixed = path.join(configDir, "valheim_plus.cfg");
    if (fs.existsSync(fixed)) return fixed;
  }
  if (!fs.existsSync(configDir)) return null;
  const files = fs.readdirSync(configDir).filter((f) => f.toLowerCase().endsWith(".cfg"));
  const stem = packageId.split("-").pop()?.toLowerCase() || "";
  if (!stem) return null;

  const exact = files.filter((f) => f.toLowerCase().replace(/\.cfg$/, "") === stem);
  if (exact.length === 1) return path.join(configDir, exact[0]);

  const partial = files.filter((f) => f.toLowerCase().includes(stem));
  if (partial.length === 1) return path.join(configDir, partial[0]);
  return null;
}

function getConfigDir(serverId: string): string {
  return path.join(dataRoot(), "local-servers", serverId, "valheim-server", "BepInEx", "config");
}

/** Look up the mod row scoped to this server — a bare id lookup would let a
 *  member of server A read/write server B's config by row id. */
async function findServerMod(serverId: string, rowId: string) {
  const mod = await prisma.modInstallation.findUnique({ where: { id: rowId } });
  if (!mod || mod.serverId !== serverId) return null;
  return mod;
}

// GET /api/servers/[id]/mods/[modId]/config
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string, modId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const mod = await findServerMod(serverId, params.modId);
    if (!mod) return NextResponse.json({ error: "Mod not found" }, { status: 404 });

    if (mod.provider !== "thunderstore") {
      return NextResponse.json({ error: "Config UI is currently only supported for Thunderstore/BepInEx mods." }, { status: 400 });
    }

    const cfgPath = findConfigFile(getConfigDir(serverId), mod.packageId);
    if (!cfgPath || !fs.existsSync(cfgPath)) {
      return NextResponse.json(
        { error: `Couldn't determine which .cfg file belongs to '${mod.name}'. Start the server with the mod once, or edit it under BepInEx/config on disk.` },
        { status: 404 }
      );
    }

    const sections = parseBepInExConfig(cfgPath);
    return NextResponse.json({ sections, file: path.basename(cfgPath) });
  } catch (error: any) {
    console.error("GET config error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/servers/[id]/mods/[modId]/config
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string, modId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }

    const { server } = access;
    if (server.status === "RUNNING" || server.status === "STARTING") {
      return NextResponse.json({ error: "Please stop the server before modifying configurations." }, { status: 400 });
    }

    const mod = await findServerMod(serverId, params.modId);
    if (!mod) return NextResponse.json({ error: "Mod not found" }, { status: 404 });

    if (mod.provider !== "thunderstore") {
      return NextResponse.json({ error: "Config UI is currently only supported for Thunderstore/BepInEx mods." }, { status: 400 });
    }

    // Newlines would inject extra lines into the .cfg — keys, values and
    // section names must each stay on one line.
    const propertySchema = z.object({
      key: z.string().min(1).max(200).regex(/^[^\r\n]+$/, "no newlines"),
      value: z.string().max(2000).regex(/^[^\r\n]*$/, "no newlines"),
      type: z.string().max(50).optional().default("String"),
      defaultValue: z.string().max(2000).optional().default(""),
      description: z.string().max(2000).optional().default(""),
    });
    const bodySchema = z.object({
      sections: z.array(z.object({
        name: z.string().min(1).max(200).regex(/^[^\r\n]+$/, "no newlines"),
        properties: z.array(propertySchema).max(500),
      })).max(50),
    });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid config payload.", details: parsed.error.format() }, { status: 400 });
    }
    const sections: ConfigSection[] = parsed.data.sections;

    const cfgPath = findConfigFile(getConfigDir(serverId), mod.packageId);
    if (!cfgPath || !fs.existsSync(cfgPath)) {
      return NextResponse.json(
        { error: `Couldn't determine which .cfg file belongs to '${mod.name}'. Start the server with the mod once, or edit it under BepInEx/config on disk.` },
        { status: 404 }
      );
    }

    // Backup the old config just in case
    fs.copyFileSync(cfgPath, `${cfgPath}.bak`);

    const newConfigStr = serializeBepInExConfig(sections);
    fs.writeFileSync(cfgPath, newConfigStr, "utf-8");

    // Log action
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_CONFIG",
        details: `Updated configuration for mod '${mod.name}' on server '${server.name}'.`,
      },
    });

    return NextResponse.json({ success: true, message: "Configuration saved successfully!" });
  } catch (error: any) {
    console.error("POST config error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
