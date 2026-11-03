import { prisma } from "@/lib/db";
import { parseParamValues } from "@/lib/definitions/serialize";
import { dataRoot } from "@/lib/appPaths";
import { readLoaderMarker } from "@/lib/mods/mcLoaders";
import { readTmlMarker, tmlInstallDir } from "@/lib/mods/tml";
import { TemplatePayload, TemplateMod, TemplateModpackRef, TemplateLoaderRef } from "./types";
import path from "path";
import fs from "fs";

export interface ExtractedRealm {
  payload: TemplatePayload;
  gameSlug: string;
  suggestedName: string;
  warnings: string[];
}

/**
 * Build a v2 realm payload from a live server's actual state: its installed
 * modpack reference, loader marker, pinned mod rows, and startup params.
 *
 * This is what makes "publish this server as a Realm" honest — the payload is
 * the machine-readable truth of what the server is running right now, and a
 * deploy of it replays those exact pins through the verified pipeline.
 *
 * Config overrides are intentionally NOT captured: pack installs bring their
 * own configs, and blindly shipping a server's whole config dir would leak
 * secrets (passwords/tokens live in configs). Authors can add specific files
 * via Server Config → Publish (which scrubs values).
 */
export async function buildRealmPayloadFromServer(serverId: string): Promise<ExtractedRealm> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: {
      definition: true,
      mods: true,
      modpack: true,
    },
  });
  if (!server) throw new Error("Server not found");
  const game = server.game.toUpperCase();
  const warnings: string[] = [];

  // --- Mods ---------------------------------------------------------------
  // Pack-owned rows are summarized by the modpack ref (re-installing the pack
  // brings them all); only standalone extras are replayed individually.
  const pack = server.modpack;
  const packOwned: string[] = pack?.packageIds ? JSON.parse(pack.packageIds) : [];
  const rows = server.mods.filter((m) => !m.disabled && !packOwned.includes(m.packageId));
  const mods: TemplateMod[] = rows.map((m) => ({
    provider: m.provider,
    packageId: m.packageId,
    name: m.name || m.packageId,
    version: m.version && m.version !== "latest" ? m.version : undefined,
    workshopModId: m.workshopModId ?? null,
  }));
  if (server.mods.some((m) => m.disabled)) {
    warnings.push(`${server.mods.filter((m) => m.disabled).length} disabled mod(s) were left out of the realm.`);
  }

  // --- Loader -------------------------------------------------------------
  let loader: TemplateLoaderRef | null = null;
  if (game === "MINECRAFT") {
    if (pack?.loaderType) {
      loader = {
        type: pack.loaderType as TemplateLoaderRef["type"],
        loaderVersion: pack.loaderVersion || "latest",
        minecraftVersion: pack.mcVersion || undefined,
      };
    } else {
      const marker = readLoaderMarker(path.join(dataRoot(), "local-servers", serverId));
      if (marker) {
    loader = {
      type: marker.type,
      loaderVersion: marker.loaderVersion,
      minecraftVersion: marker.minecraftVersion ?? undefined,
    };
      }
    }
    if (mods.length > 0 && !loader && !pack) {
      warnings.push("This server has mods but no mod loader — deploys will warn that a vanilla server won't load them.");
    }
  } else if (game === "TERRARIA") {
    const tml = readTmlMarker(tmlInstallDir(path.join(dataRoot(), "local-servers", serverId)));
    if (tml) loader = { type: "tmodloader", loaderVersion: tml.tmlVersion || "latest" };
  }

  // --- Provider modpack reference ------------------------------------------
  let modpack: TemplateModpackRef | null = null;
  if (pack) {
    if (!pack.projectId) {
      throw new Error(
        "This server's modpack was imported from a local file without a provider id — it can't be re-downloaded by a deploy. Publish a pack installed from CurseForge or Modrinth instead."
      );
    }
    modpack = {
      kind: pack.kind === "curseforge" ? "curseforge" : "mrpack",
      projectId: pack.projectId,
      // A pinned fileId freezes the realm on today's pack build; realm deploys
      // should track the pack's newest published file, so never pin here.
      fileId: null,
      packName: pack.packName,
      packVersion: pack.version,
      mcVersion: pack.mcVersion ?? null,
      loaderType: pack.loaderType ?? null,
      loaderVersion: pack.loaderVersion ?? null,
    };
  }

  // --- Startup params ------------------------------------------------------
  // parseParamValues is garbage-tolerant (returns {} on unparseable input).
  const startupParams: Record<string, string> = {};
  const parsed = parseParamValues(server.paramValues);
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== null && v !== undefined) startupParams[k] = String(v);
  }

  return {
    payload: {
      version: "2.0",
      mods,
      configOverrides: [],
      startupParams,
      loader,
      modpack,
    },
    gameSlug: game,
    suggestedName: server.name.replace(/\s*-\s*Deployed$/, ""),
    warnings,
  };
}
