import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "fs";
import os from "os";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { parseBepInExConfig, ConfigSection } from "@/lib/mods/configParser";
import { serializeBepInExConfig } from "@/lib/mods/configSerializer";
import { parseTomlConfig, serializeTomlConfig } from "@/lib/mods/tomlConfig";
import { parseJsonConfig, serializeJsonConfig } from "@/lib/mods/jsonConfig";
import { dataRoot } from "@/lib/appPaths";
import path from "path";
import AdmZip from "adm-zip";
import { agentListServerDir, agentReadServerFile, agentWriteServerFile } from "@/lib/agents/agentFiles";

/**
 * The Configure modal's backend. Each mod ecosystem names and formats its
 * config files differently:
 * - Thunderstore (Valheim/V Rising, BepInEx): BepInEx/config/*.cfg INI files.
 * - Minecraft (Modrinth/CurseForge): Forge-standard config/<modid>.toml.
 * - Rust (uMod/Oxide): Oxide/config/<Plugin>.json.
 * Everything else honestly refuses. Format parsing lives in
 * configParser/configSerializer (cfg), tomlConfig, jsonConfig.
 *
 * AGENT servers resolve the same way but against the node's directory
 * listing and file contents (ferried over the command queue) instead of the
 * dashboard's disk.
 */

/** BepInEx config dirs per game (Thunderstore provider covers both). */
function bepinexConfigDir(serverId: string, game: string): string | null {
  const dirName = game === "VALHEIM" ? "valheim-server" : game === "VRISING" ? "vrising-server" : null;
  if (!dirName) return null;
  return path.join(dataRoot(), "local-servers", serverId, dirName, "BepInEx", "config");
}

/** Data-dir-relative BepInEx config dir for AGENT servers (same layout). */
function bepinexConfigRelDir(game: string): string | null {
  const dirName = game === "VALHEIM" ? "valheim-server" : game === "VRISING" ? "vrising-server" : null;
  return dirName ? `${dirName}/BepInEx/config` : null;
}

/**
 * Match a mod's config filename within a directory listing: an exact
 * filename-stem match wins, a UNIQUE substring match is accepted, and zero
 * or several matches refuse honestly — substring guessing across several
 * candidates would silently edit another mod's config.
 */
function matchConfigFileName(files: string[], packageId: string, extension: string): string | null {
  const stem = packageId.split("-").pop()?.toLowerCase() || "";
  if (!stem) return null;
  const exact = files.filter((f) => f.toLowerCase().replace(new RegExp(`\\${extension}$`, "i"), "") === stem);
  if (exact.length === 1) return exact[0];
  const partial = files.filter((f) => f.toLowerCase().includes(stem));
  if (partial.length === 1) return partial[0];
  return null;
}

/**
 * Find the BepInEx .cfg file that belongs to a Thunderstore package.
 * Package id → cfg filename has no reliable mapping (plugins name their own
 * cfg files at first boot), so matching follows matchConfigFileName, plus
 * the fixed ValheimPlus filename.
 */
function findConfigFile(configDir: string, packageId: string): string | null {
  if (packageId === "ValheimPlus-ValheimPlus") {
    const fixed = path.join(configDir, "valheim_plus.cfg");
    if (fs.existsSync(fixed)) return fixed;
  }
  if (!fs.existsSync(configDir)) return null;
  const files = fs.readdirSync(configDir).filter((f) => f.toLowerCase().endsWith(".cfg"));
  const match = matchConfigFileName(files, packageId, ".cfg");
  return match ? path.join(configDir, match) : null;
}

/**
 * Read a mod jar's own metadata for its config file name: Forge/NeoForge
 * mods declare `modId` in META-INF/mods.toml, Fabric/Quilt mods declare
 * `id` in fabric.mod.json / quilt.mod.json. That modid is how the mod names
 * its config/<modid>.toml — the package id the row carries is a store id
 * (numeric for CurseForge) and usually matches nothing on disk.
 */
function readJarConfigStem(jarPath: string): string | null {
  try {
    const zip = new AdmZip(jarPath);
    for (const [entryName, pattern] of [
      ["META-INF/mods.toml", /modId\s*=\s*"([^"]+)"/],
      ["META-INF/neoforge.mods.toml", /modId\s*=\s*"([^"]+)"/],
      ["fabric.mod.json", /"id"\s*:\s*"([^"]+)"/],
      ["quilt.mod.json", /"id"\s*:\s*"([^"]+)"/],
    ] as const) {
      const entry = zip.getEntry(entryName);
      if (!entry) continue;
      const match = entry.getData().toString("utf-8").match(pattern);
      if (match?.[1]) return match[1];
    }
  } catch {
    // Unreadable jar — fall through to stem matching.
  }
  return null;
}

/** Minecraft stem matching over a config/ listing (no jar metadata — on a
 *  node the jar isn't on this machine, so the store-packageId stem heuristics
 *  are what's available). */
function matchMinecraftConfigName(files: string[], packageId: string): string | null {
  return matchConfigFileName(files.filter((f) => f.toLowerCase().endsWith(".toml")), packageId.toLowerCase(), ".toml");
}

/**
 * Find a Minecraft mod's TOML config: jar-declared modid first, then the
 * same exact/unique-substring stem heuristic the BepInEx flow uses.
 */
function findMinecraftConfigFile(serverRoot: string, packageId: string): string | null {
  const configDir = path.join(serverRoot, "config");
  if (!fs.existsSync(configDir)) return null;
  const jarPath = path.join(serverRoot, "mods", `${packageId}.jar`);
  if (fs.existsSync(jarPath)) {
    const stem = readJarConfigStem(jarPath);
    if (stem && fs.existsSync(path.join(configDir, `${stem}.toml`))) {
      return path.join(configDir, `${stem}.toml`);
    }
  }
  const files = fs.readdirSync(configDir).filter((f) => f.toLowerCase().endsWith(".toml"));
  const match = matchMinecraftConfigName(files, packageId);
  return match ? path.join(configDir, match) : null;
}

/** Resolve (file, format) for a mod row on a LOCAL/DOCKER server, or an
 *  honest error message. */
function resolveModConfig(
  serverId: string,
  game: string,
  mod: { provider: string; packageId: string; name: string }
): { file: string; format: "cfg" | "toml" | "json" } | { error: string } {
  if (mod.provider === "thunderstore") {
    const configDir = bepinexConfigDir(serverId, game);
    if (!configDir) {
      return { error: "BepInEx config editing is only available for Valheim and V Rising servers." };
    }
    const cfgPath = findConfigFile(configDir, mod.packageId);
    if (!cfgPath || !fs.existsSync(cfgPath)) {
      return {
        error: `Couldn't determine which .cfg file belongs to '${mod.name}'. Start the server with the mod once, or edit it under BepInEx/config on disk.`,
      };
    }
    return { file: cfgPath, format: "cfg" };
  }

  if (mod.provider === "modrinth" || mod.provider === "curseforge") {
    if (game !== "MINECRAFT") {
      return { error: "Config editing for this provider is only available on Minecraft servers." };
    }
    const tomlPath = findMinecraftConfigFile(path.join(dataRoot(), "local-servers", serverId), mod.packageId);
    if (!tomlPath) {
      return {
        error: `Couldn't determine which config file belongs to '${mod.name}'. Start the server with the mod once (it writes config/<modid>.toml), or edit it on disk.`,
      };
    }
    return { file: tomlPath, format: "toml" };
  }

  if (mod.provider === "umod") {
    if (game !== "RUST") {
      return { error: "Config editing for this provider is only available on Rust servers." };
    }
    const jsonPath = path.join(
      dataRoot(), "local-servers", serverId, "rust-server", "Oxide", "config", `${mod.packageId}.json`
    );
    if (!fs.existsSync(jsonPath)) {
      return {
        error: `No config file for '${mod.name}' yet — plugins write Oxide/config/<Plugin>.json on their first boot. Start the server once, or edit it on disk.`,
      };
    }
    return { file: jsonPath, format: "json" };
  }

  return { error: "Config editing isn't available for this mod's provider." };
}

/** Same resolution against the node's directory listing (AGENT servers).
 *  Paths are data-dir-relative. The Minecraft jar-metadata refinement isn't
 *  possible remotely (the jar lives on the node) — stem matching covers it,
 *  exactly like a local server whose jar is unreadable. */
async function resolveModConfigRemote(
  serverId: string,
  game: string,
  mod: { provider: string; packageId: string; name: string }
): Promise<{ relPath: string; format: "cfg" | "toml" | "json" } | { error: string }> {
  if (mod.provider === "thunderstore") {
    const relDir = bepinexConfigRelDir(game);
    if (!relDir) {
      return { error: "BepInEx config editing is only available for Valheim and V Rising servers." };
    }
    const entries = await agentListServerDir(serverId, relDir);
    const files = entries.filter((e) => !e.isDir && e.name.toLowerCase().endsWith(".cfg")).map((e) => e.name);
    if (mod.packageId === "ValheimPlus-ValheimPlus" && files.some((f) => f === "valheim_plus.cfg")) {
      return { relPath: `${relDir}/valheim_plus.cfg`, format: "cfg" };
    }
    const match = matchConfigFileName(files, mod.packageId, ".cfg");
    if (!match) {
      return {
        error: `Couldn't determine which .cfg file belongs to '${mod.name}'. Start the server with the mod once, or edit it under BepInEx/config on the node.`,
      };
    }
    return { relPath: `${relDir}/${match}`, format: "cfg" };
  }

  if (mod.provider === "modrinth" || mod.provider === "curseforge") {
    if (game !== "MINECRAFT") {
      return { error: "Config editing for this provider is only available on Minecraft servers." };
    }
    const entries = await agentListServerDir(serverId, "config");
    const files = entries.filter((e) => !e.isDir && e.name.toLowerCase().endsWith(".toml")).map((e) => e.name);
    const match = matchMinecraftConfigName(files, mod.packageId);
    if (!match) {
      return {
        error: `Couldn't determine which config file belongs to '${mod.name}'. Start the server with the mod once (it writes config/<modid>.toml), or edit it on the node.`,
      };
    }
    return { relPath: `config/${match}`, format: "toml" };
  }

  if (mod.provider === "umod") {
    if (game !== "RUST") {
      return { error: "Config editing for this provider is only available on Rust servers." };
    }
    const relPath = `rust-server/Oxide/config/${mod.packageId}.json`;
    const remote = await agentReadServerFile(serverId, relPath);
    if (!remote.exists) {
      return {
        error: `No config file for '${mod.name}' yet — plugins write Oxide/config/<Plugin>.json on their first boot. Start the server once, or edit it on the node.`,
      };
    }
    return { relPath, format: "json" };
  }

  return { error: "Config editing isn't available for this mod's provider." };
}

/** Run a file-based parser/serializer against remote content: the config
 *  parsers read from disk, so stage the node's bytes in a temp file. */
async function withRemoteContent<T>(serverId: string, relPath: string, fn: (tmpPath: string) => T): Promise<T> {
  const remote = await agentReadServerFile(serverId, relPath);
  if (!remote.exists || remote.content === null) {
    throw new Error("The config file disappeared from the node — refresh and try again.");
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-modcfg-"));
  try {
    const staged = path.join(tmp, path.basename(relPath));
    fs.writeFileSync(staged, remote.content, "utf-8");
    return fn(staged);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
  props: { params: Promise<{ id: string, modId: string }> }
) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const mod = await findServerMod(serverId, params.modId);
    if (!mod) return NextResponse.json({ error: "Mod not found" }, { status: 404 });

    const game = access.server.game.toUpperCase();

    if (access.server.runnerType === "AGENT") {
      const resolved = await resolveModConfigRemote(serverId, game, mod);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.error.includes("only available") ? 400 : 404 });
      }
      const sections = await withRemoteContent(serverId, resolved.relPath, (staged) =>
        resolved.format === "cfg" ? parseBepInExConfig(staged)
        : resolved.format === "toml" ? parseTomlConfig(staged)
        : parseJsonConfig(staged)
      );
      return NextResponse.json({
        sections,
        file: resolved.relPath.split("/").pop() ?? resolved.relPath,
        format: resolved.format,
      });
    }

    const resolved = resolveModConfig(serverId, game, mod);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.error.includes("only available") ? 400 : 404 });
    }

    const sections =
      resolved.format === "cfg" ? parseBepInExConfig(resolved.file)
      : resolved.format === "toml" ? parseTomlConfig(resolved.file)
      : parseJsonConfig(resolved.file);
    return NextResponse.json({ sections, file: path.basename(resolved.file), format: resolved.format });
  } catch (error: any) {
    console.error("GET config error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/servers/[id]/mods/[modId]/config
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string, modId: string }> }
) {
  const params = await props.params;
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

    // Newlines would inject extra lines into single-line values — keys,
    // values and section names must each stay on one line (the JSON type is
    // the exception; its parser validates the whole blob).
    const propertySchema = z.object({
      key: z.string().min(1).max(200).regex(/^[^\r\n]+$/, "no newlines"),
      value: z.string().max(20000).regex(/^[^\r\n]*$/, "no newlines"),
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

    if (server.runnerType === "AGENT") {
      const resolved = await resolveModConfigRemote(serverId, server.game.toUpperCase(), mod);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 404 });
      }
      try {
        const updated = await withRemoteContent(serverId, resolved.relPath, (staged) => {
          if (resolved.format === "cfg") return serializeBepInExConfig(sections);
          if (resolved.format === "toml") return serializeTomlConfig(staged, sections);
          return serializeJsonConfig(staged, sections);
        });
        await agentWriteServerFile(serverId, resolved.relPath, updated, { backup: true });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    } else {
      const resolved = resolveModConfig(serverId, server.game.toUpperCase(), mod);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 404 });
      }

      // Backup the old config just in case
      fs.copyFileSync(resolved.file, `${resolved.file}.bak`);

      try {
        if (resolved.format === "cfg") {
          fs.writeFileSync(resolved.file, serializeBepInExConfig(sections), "utf-8");
        } else if (resolved.format === "toml") {
          fs.writeFileSync(resolved.file, serializeTomlConfig(resolved.file, sections), "utf-8");
        } else {
          fs.writeFileSync(resolved.file, serializeJsonConfig(resolved.file, sections), "utf-8");
        }
      } catch (err: any) {
        // The .bak copy lets the user recover; surface the validation error.
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    }

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
