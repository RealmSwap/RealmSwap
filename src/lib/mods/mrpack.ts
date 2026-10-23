import AdmZip from "adm-zip";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { safeJoin } from "../safePath";

/**
 * Modrinth `.mrpack` modpack format support.
 *
 * An .mrpack is a zip containing `modrinth.index.json` (a manifest whose file
 * entries carry direct download URLs plus sha1/sha512 hashes and client/server
 * env flags), with optional `overrides/` and `server-overrides/` trees. The
 * mod jars themselves are NOT inside the pack — they are fetched from the URLs
 * in the index, so hash verification is the integrity gate. `client-overrides/`
 * must never be applied to a server.
 *
 * Every path originating inside the pack (manifest paths and override entry
 * names) is untrusted input: absolute paths, backslashes, and `..`/`.`
 * segments are rejected before anything touches disk, independent of platform.
 */

export interface MrpackFile {
  path: string;
  hashes: Record<string, string>;
  env?: { client?: string; server?: string } | null;
  downloads: string[];
  fileSize?: number;
}

export interface MrpackIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  dependencies: Record<string, string>;
  files: MrpackFile[];
}

export function readMrpackIndex(zip: AdmZip): MrpackIndex {
  const entry = zip.getEntry("modrinth.index.json");
  if (!entry) {
    if (zip.getEntry("manifest.json")) {
      throw new Error(
        "This is a CurseForge modpack. CurseForge pack import isn't supported yet — download the pack in Modrinth (.mrpack) format instead."
      );
    }
    throw new Error("Not a Modrinth modpack: modrinth.index.json is missing from the archive.");
  }

  const index = JSON.parse(zip.readAsText(entry));
  if (index?.formatVersion !== 1) {
    throw new Error(`Unsupported .mrpack format version: ${index?.formatVersion ?? "missing"} (expected 1).`);
  }
  if (index?.game !== "minecraft") {
    throw new Error(`This pack targets '${index?.game ?? "unknown"}' — only Minecraft packs are supported.`);
  }
  if (!Array.isArray(index?.files)) {
    throw new Error("Malformed modpack index: 'files' is missing or not an array.");
  }
  return index as MrpackIndex;
}

/** Validate a pack-relative path and normalize it to platform separators. Throws on anything unsafe. */
export function safePackPath(p: string): string {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("Invalid file path in modpack index.");
  }
  if (path.isAbsolute(p) || p.includes("\\") || p.includes(":")) {
    throw new Error(`Unsafe path in modpack index: ${p}`);
  }
  const parts = p.split("/");
  if (parts.some((seg) => seg === "" || seg === "." || seg === "..")) {
    throw new Error(`Unsafe path in modpack index: ${p}`);
  }
  return path.join(...parts);
}

export interface SelectedServerFiles {
  install: MrpackFile[];
  clientOnly: MrpackFile[];
  optional: MrpackFile[];
}

/** Split manifest files by their server env flag (absent env counts as required). */
export function selectServerFiles(files: MrpackFile[]): SelectedServerFiles {
  const install: MrpackFile[] = [];
  const clientOnly: MrpackFile[] = [];
  const optional: MrpackFile[] = [];
  for (const file of files) {
    const serverEnv = file.env?.server ?? "required";
    if (serverEnv === "unsupported") {
      clientOnly.push(file);
    } else {
      install.push(file);
      if (serverEnv === "optional") optional.push(file);
    }
  }
  return { install, clientOnly, optional };
}

/** Verify a downloaded file against the index hashes. Prefers sha512; falls back to sha1; no hashes fails closed. */
export function verifyFileHash(buf: Buffer, hashes: Record<string, string>): boolean {
  const algo = hashes?.sha512 ? "sha512" : hashes?.sha1 ? "sha1" : null;
  if (!algo) return false;
  const actual = crypto.createHash(algo).update(buf).digest("hex");
  return actual === hashes[algo].toLowerCase();
}

/**
 * Extract the pack's `overrides/` and `server-overrides/` trees into the
 * server root. `client-overrides/` and anything else in the archive is
 * ignored. Returns the number of files written.
 */
export function extractMrpackOverrides(zip: AdmZip, serverRoot: string): number {
  let count = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    let rel: string | null = null;
    if (name.startsWith("overrides/")) rel = name.slice("overrides/".length);
    else if (name.startsWith("server-overrides/")) rel = name.slice("server-overrides/".length);
    else continue;
    const target = safeJoin(serverRoot, safePackPath(rel));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
    count++;
  }
  return count;
}

export interface MrpackLoaderRequirement {
  type: "fabric" | "quilt" | "forge" | "neoforge";
  version: string;
}

/** Which mod loader a pack pins via its dependencies map, if any. */
export function loaderRequirement(index: MrpackIndex): MrpackLoaderRequirement | null {
  const deps = index.dependencies ?? {};
  if (deps["fabric-loader"]) return { type: "fabric", version: deps["fabric-loader"] };
  if (deps["quilt-loader"]) return { type: "quilt", version: deps["quilt-loader"] };
  if (deps["neoforge"]) return { type: "neoforge", version: deps["neoforge"] };
  if (deps["forge"]) return { type: "forge", version: deps["forge"] };
  return null;
}
