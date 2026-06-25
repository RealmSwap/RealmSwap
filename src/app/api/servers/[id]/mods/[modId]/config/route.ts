import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { parseBepInExConfig, ConfigSection } from "@/lib/mods/configParser";
import { serializeBepInExConfig } from "@/lib/mods/configSerializer";
import { dataRoot } from "@/lib/appPaths";
import path from "path";
import fs from "fs";

function getConfigPath(serverId: string, packageId: string): string {
  // Map packageId to its likely .cfg filename.
  // E.g., 'ValheimPlus-ValheimPlus' -> 'valheim_plus.cfg' 
  // In a real app, this mapping would be stored in the ModProvider or database.
  const valheimDir = path.join(dataRoot(), "local-servers", serverId, "valheim-server");
  const configDir = path.join(valheimDir, "BepInEx", "config");
  
  if (packageId === "ValheimPlus-ValheimPlus") {
    return path.join(configDir, "valheim_plus.cfg");
  }
  
  // Fallback heuristic: try to find a .cfg file that matches part of the packageId
  if (fs.existsSync(configDir)) {
    const files = fs.readdirSync(configDir);
    const searchStr = packageId.split("-").pop()?.toLowerCase() || "";
    for (const file of files) {
      if (file.toLowerCase().includes(searchStr) && file.endsWith(".cfg")) {
        return path.join(configDir, file);
      }
    }
  }

  return path.join(configDir, `${packageId}.cfg`);
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

    const mod = await prisma.modInstallation.findUnique({
      where: { id: params.modId }
    });

    if (!mod) return NextResponse.json({ error: "Mod not found" }, { status: 404 });

    if (mod.provider !== "thunderstore") {
      return NextResponse.json({ error: "Config UI is currently only supported for Thunderstore/BepInEx mods." }, { status: 400 });
    }

    const cfgPath = getConfigPath(serverId, mod.packageId);

    if (!fs.existsSync(cfgPath)) {
      return NextResponse.json({ error: "Configuration file not found. Have you started the server with the mod installed at least once?" }, { status: 404 });
    }

    const sections = parseBepInExConfig(cfgPath);
    return NextResponse.json({ sections });
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
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const { server } = access;
    if (server.status === "RUNNING") {
      return NextResponse.json({ error: "Please stop the server before modifying configurations." }, { status: 400 });
    }

    const mod = await prisma.modInstallation.findUnique({
      where: { id: params.modId }
    });

    if (!mod) return NextResponse.json({ error: "Mod not found" }, { status: 404 });

    const { sections } = await req.json() as { sections: ConfigSection[] };
    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: "Invalid payload: 'sections' array is required." }, { status: 400 });
    }

    const cfgPath = getConfigPath(serverId, mod.packageId);
    
    // Backup the old config just in case
    if (fs.existsSync(cfgPath)) {
      fs.copyFileSync(cfgPath, `${cfgPath}.bak`);
    }

    const newConfigStr = serializeBepInExConfig(sections);
    fs.writeFileSync(cfgPath, newConfigStr, "utf-8");

    // Log action
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "RESTORE_SERVER", // We should probably add a "UPDATE_CONFIG" action
        details: `Updated configuration for mod '${mod.name}' on server '${server.name}'.`,
      },
    });

    return NextResponse.json({ success: true, message: "Configuration saved successfully!" });
  } catch (error: any) {
    console.error("POST config error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
