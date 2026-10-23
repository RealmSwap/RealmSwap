import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { downloadFile } from "../download";

/**
 * Minecraft mod-loader support.
 *
 * A vanilla `server.jar` never reads the `mods/` directory — without a loader
 * installed, every jar dropped there is a silent no-op (the server boots fine,
 * the mod simply never loads). This module detects what a server/jar actually
 * needs and installs the Fabric server launcher, recording a marker file the
 * runner consults at launch.
 *
 * Forge is deliberately not installed yet: its installer requires a full Java
 * extraction step and is tracked as a follow-up. Callers must refuse with a
 * clear error rather than pretending a Forge mod works on a vanilla server.
 */

export type LoaderType = "fabric" | "quilt" | "forge";

export interface LoaderMarker {
  type: LoaderType;
  loaderVersion: string;
  minecraftVersion: string;
  installedAt: string;
}

const MARKER_FILE = "realmswap-loader.json";
const FABRIC_META = "https://meta.fabricmc.net/v2";

export function loaderMarkerPath(installDir: string): string {
  return path.join(installDir, MARKER_FILE);
}

export function readLoaderMarker(installDir: string): LoaderMarker | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(loaderMarkerPath(installDir), "utf-8"));
    if (parsed && typeof parsed.type === "string") return parsed as LoaderMarker;
  } catch {
    // absent or corrupt — treat as no loader
  }
  return null;
}

export function writeLoaderMarker(installDir: string, marker: LoaderMarker): void {
  fs.writeFileSync(loaderMarkerPath(installDir), JSON.stringify(marker, null, 2));
}

/** The Minecraft version of an installed server, read from version.json inside server.jar. */
export function detectMinecraftVersion(installDir: string): string | null {
  try {
    const jar = path.join(installDir, "server.jar");
    if (!fs.existsSync(jar)) return null;
    const zip = new AdmZip(jar);
    const entry = zip.getEntry("version.json");
    if (!entry) return null;
    const parsed = JSON.parse(zip.readAsText(entry));
    return parsed?.id || parsed?.name || null;
  } catch {
    return null;
  }
}

/**
 * Which loader a mod jar targets, read from its manifest:
 * fabric.mod.json (Fabric), quilt.mod.json (Quilt), META-INF/mods.toml (Forge/NeoForge).
 */
export function detectModLoader(jarPath: string): LoaderType | null {
  try {
    const zip = new AdmZip(jarPath);
    if (zip.getEntry("fabric.mod.json")) return "fabric";
    if (zip.getEntry("quilt.mod.json")) return "quilt";
    const toml = zip.getEntry("META-INF/mods.toml");
    if (toml) {
      const text = zip.readAsText(toml);
      return text.includes("loader=\"javafml\"") || text.includes("javafml") ? "forge" : "forge";
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fabric meta request failed (${res.status}): ${url}`);
  return res.json();
}

/**
 * Install the Fabric server launcher for the given Minecraft version:
 * downloads `fabric-server-launch.jar` via the official Fabric meta API and
 * writes the loader marker. The vanilla server.jar is left in place — the
 * launcher downloads/provisions what it needs on first boot.
 */
export async function installFabricServer(
  installDir: string,
  minecraftVersion: string,
  onLog: (msg: string) => void = () => {}
): Promise<LoaderMarker> {
  onLog(`Resolving latest Fabric loader for Minecraft ${minecraftVersion}…`);
  const loaders: any[] = await fetchJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(minecraftVersion)}`);
  const stable = loaders.find((l) => l?.loader?.stable) ?? loaders[0];
  const loaderVersion: string | undefined = stable?.loader?.version;
  if (!loaderVersion) throw new Error(`No Fabric loader available for Minecraft ${minecraftVersion}`);

  onLog("Resolving Fabric installer version…");
  const installers: any[] = await fetchJson(`${FABRIC_META}/versions/installer`);
  const installerVersion: string | undefined = installers[0]?.version;
  if (!installerVersion) throw new Error("No Fabric installer version available");

  const jarUrl = `${FABRIC_META}/versions/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(loaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`;
  const dest = path.join(installDir, "fabric-server-launch.jar");
  onLog(`Downloading Fabric server launcher…`);
  await downloadFile(jarUrl, dest);

  const marker: LoaderMarker = {
    type: "fabric",
    loaderVersion,
    minecraftVersion,
    installedAt: new Date().toISOString(),
  };
  writeLoaderMarker(installDir, marker);
  onLog(`Fabric ${loaderVersion} installed for Minecraft ${minecraftVersion}.`);
  return marker;
}
