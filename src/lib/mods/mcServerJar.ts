/**
 * Vanilla Minecraft server.jar resolution and swap. Modpacks pin a Minecraft
 * version — when the server's jar is a different release, the pack apply
 * swaps in the exact vanilla build the pack targets before any loader or mod
 * files land. Version → download URL resolves through Mojang's piston-meta
 * version manifest.
 */

import fs from "fs";
import path from "path";
import { safeJoin } from "@/lib/safePath";
import { downloadFile } from "@/lib/download";
import { verifyFileHash } from "@/lib/mods/mrpack";

const VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

export interface VanillaServerJar {
  url: string;
  sha1: string | null;
}

interface VersionManifest {
  versions?: { id: string; url: string; type: string }[];
}

interface VersionMeta {
  downloads?: { server?: { url: string; sha1?: string } };
}

/**
 * Resolve the official vanilla server.jar download for a Minecraft version.
 * Throws with a user-presentable message when the version doesn't exist or
 * Mojang publishes no server download for it.
 */
export async function resolveVanillaServerJar(
  mcVersion: string,
  deps?: { fetchImpl?: typeof fetch }
): Promise<VanillaServerJar> {
  const doFetch = deps?.fetchImpl ?? fetch;

  const manifestRes = await doFetch(VERSION_MANIFEST_URL, { headers: { Accept: "application/json" } });
  if (!manifestRes.ok) {
    throw new Error(`Couldn't load Mojang's version manifest (HTTP ${manifestRes.status}).`);
  }
  const manifest = (await manifestRes.json()) as VersionManifest;
  const entry = manifest.versions?.find((v) => v.id === mcVersion);
  if (!entry) {
    throw new Error(`Minecraft ${mcVersion} isn't a known Mojang release.`);
  }

  const metaRes = await doFetch(entry.url, { headers: { Accept: "application/json" } });
  if (!metaRes.ok) {
    throw new Error(`Couldn't load Mojang's metadata for Minecraft ${mcVersion} (HTTP ${metaRes.status}).`);
  }
  const meta = (await metaRes.json()) as VersionMeta;
  const server = meta.downloads?.server;
  if (!server?.url) {
    throw new Error(`Mojang publishes no server download for Minecraft ${mcVersion}.`);
  }
  return { url: server.url, sha1: server.sha1?.toLowerCase() ?? null };
}

/**
 * Download and swap in the given vanilla server.jar. The old jar is left to
 * the caller's snapshot — a failed boot test rolls the swap back. The staged
 * download keeps a partial fetch from ever looking like a valid jar.
 */
export async function applyVanillaServerSwap(args: {
  serverRoot: string;
  jar: VanillaServerJar;
}): Promise<void> {
  const { serverRoot, jar } = args;
  const staging = safeJoin(serverRoot, ".server.jar.staging");
  try {
    await downloadFile(jar.url, staging);
    if (jar.sha1 && !verifyFileHash(fs.readFileSync(staging), { sha1: jar.sha1 })) {
      throw new Error("The downloaded server.jar doesn't match Mojang's published checksum.");
    }
    fs.renameSync(staging, path.join(serverRoot, "server.jar"));
  } finally {
    try { fs.unlinkSync(staging); } catch (_) {}
  }
}
