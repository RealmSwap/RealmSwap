import fs from "fs";
import path from "path";
import { WORKSHOP_APP_IDS } from "@/lib/mods/workshop";

/**
 * tModLoader (Terraria) support: paths, the loader marker, and the
 * Mods/enabled.json maintenance every install/update/uninstall rides on.
 *
 * Ground truth (tML 1.4.5 source + a live SteamCMD workshop download):
 * - tModLoader is Steam app 1281930; its Workshop items are the mod source.
 *   Anonymous `workshop_download_item 1281930 <id>` lands at
 *   `<installDir>/steamapps/workshop/content/1281930/<id>/` containing
 *   `workshop.json` (ContentType "Mod" + tags) and `<tML-version>/<Name>.tmod`.
 * - tML discovers workshop folders WITHOUT a Steam client via the
 *   `-steamworkshopfolder <dir>` launch arg and picks the right .tmod
 *   version folder itself (ModOrganizer.GetActiveTmodInRepo).
 * - A mod loads iff its name is listed in `<SavePath>/Mods/enabled.json`
 *   (a JSON string array; a missing file means nothing is enabled).
 *   `-tmlsavedirectory <dir>` pins SavePath inside the server dir.
 * - The canonical headless launch (tML's manage-tModLoaderServer.sh) is
 *   `-server -config serverconfig.txt -steamworkshopfolder <dir>
 *   -tmlsavedirectory <dir>`; on Windows start-tModLoaderServer.bat wraps it
 *   and MUST see `-nosteam` or it interactively prompts for a lobby type.
 */

/** The tModLoader install lives beside the vanilla server, never inside it. */
export function tmlInstallDir(serverRoot: string): string {
  return path.join(serverRoot, "tmodloader");
}

/** Marker written once the tML app is installed; its presence swaps the launch. */
export function tmlMarkerPath(installDir: string): string {
  return path.join(installDir, ".realmswap-tml.json");
}

/**
 * The tML launch swap is implemented on the Windows LocalRunner only — a
 * container/agent runner would silently boot vanilla TerrariaServer instead,
 * which is exactly the silent-no-op class this repo refuses. Callers planning
 * container starts throw here when the marker is present.
 */
export function assertNoTmlForContainerRunner(serverRoot: string): void {
  if (readTmlMarker(tmlInstallDir(serverRoot))) {
    throw new Error(
      "This Terraria server has tModLoader installed, which only runs under the Windows local runner today — restore a pre-tModLoader snapshot (Backups) or run the server on a local machine."
    );
  }
}

export interface TmlMarker {
  type: "tmodloader";
  installedAt: string;
  /** tML version seen in the depot manifest, display-only. */
  tmlVersion?: string;
}

export function readTmlMarker(installDir: string): TmlMarker | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(tmlMarkerPath(installDir), "utf-8"));
    if (parsed && parsed.type === "tmodloader") return parsed as TmlMarker;
    return null;
  } catch {
    return null;
  }
}

export function writeTmlMarker(installDir: string, marker: TmlMarker): void {
  fs.writeFileSync(tmlMarkerPath(installDir), JSON.stringify(marker, null, 2));
}

/** Where -tmlsavedirectory points: worlds of tML state live inside the install. */
export function tmlSaveDir(installDir: string): string {
  return path.join(installDir, "tModLoader-server");
}

/** The workshop root SteamCMD downloads into / -steamworkshopfolder points at. */
export function tmlWorkshopRoot(installDir: string): string {
  return path.join(installDir, "steamapps", "workshop");
}

export function tmlEnabledJsonPath(installDir: string): string {
  return path.join(tmlSaveDir(installDir), "Mods", "enabled.json");
}

/**
 * Runner-injected launch args that make a headless tML server self-contained:
 * -nosteam (skip the interactive lobby prompt — otherwise the server waits on
 * stdin forever), and the two directory pins (mod state + workshop discovery).
 */
export function tmlLaunchArgs(installDir: string): string[] {
  return [
    "-nosteam",
    "-tmlsavedirectory", tmlSaveDir(installDir),
    "-steamworkshopfolder", tmlWorkshopRoot(installDir),
  ];
}

/**
 * The vanilla Terraria spec launches with `-world worlds/<name>.wld` relative
 * to terraria-server/. tML runs with its own install dir as cwd, so the world
 * arg must be redirected back to the SAME file — one worlds folder keeps the
 * world playable in vanilla and tML alike and keeps backups game-agnostic.
 * Pure: returns a new array.
 */
export function rewriteWorldArgForTml(args: string[]): string[] {
  const next = [...args];
  const idx = next.indexOf("-world");
  if (idx !== -1 && idx + 1 < next.length) {
    const world = next[idx + 1];
    if (!path.isAbsolute(world)) {
      next[idx + 1] = `../terraria-server/${world}`;
    }
  }
  return next;
}

// ─── enabled.json ───────────────────────────────────────────────────────────

/** Read the enabled-mod names; a missing or malformed file means none enabled. */
export function readTmlEnabledMods(enabledJsonPath: string): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(enabledJsonPath, "utf-8"));
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Add mod names to enabled.json (idempotent; foreign entries preserved). */
export function addTmlEnabledMods(enabledJsonPath: string, names: string[]): void {
  const current = readTmlEnabledMods(enabledJsonPath);
  const merged = [...current];
  for (const name of names) {
    if (!merged.includes(name)) merged.push(name);
  }
  fs.mkdirSync(path.dirname(enabledJsonPath), { recursive: true });
  fs.writeFileSync(enabledJsonPath, JSON.stringify(merged, null, 2));
}

/** Remove mod names from enabled.json; the file/dir survive for the rest. */
export function removeTmlEnabledMods(enabledJsonPath: string, names: string[]): void {
  const current = readTmlEnabledMods(enabledJsonPath);
  const remove = new Set(names);
  fs.mkdirSync(path.dirname(enabledJsonPath), { recursive: true });
  fs.writeFileSync(enabledJsonPath, JSON.stringify(current.filter((n) => !remove.has(n)), null, 2));
}

// ─── Workshop item inspection ───────────────────────────────────────────────

/**
 * Uninstall one Workshop mod: drop its names from enabled.json and delete the
 * downloaded item dir (the .tmod lives inside it — tML loads straight from
 * the workshop dir, there is no copy under Mods/).
 */
export function removeTmlWorkshopMod(serverRoot: string, workshopId: string, modNames: string[]): void {
  const installDir = tmlInstallDir(serverRoot);
  if (modNames.length > 0) {
    removeTmlEnabledMods(tmlEnabledJsonPath(installDir), modNames);
  }
  const contentDir = path.join(
    tmlWorkshopRoot(installDir), "content", String(WORKSHOP_APP_IDS.TERRARIA), workshopId
  );
  if (fs.existsSync(contentDir)) {
    fs.rmSync(contentDir, { recursive: true, force: true });
  }
}

export interface DerivedTmod {
  /** The mod's internal name — the .tmod filename stem, which is what
   *  enabled.json lists and tML reports in logs. */
  name: string;
}

/**
 * Derive every mod a downloaded workshop item carries: one per .tmod found
 * (max depth 3 — items lay out `<tML-version>/<Name>.tmod`). Throws when the
 * item contains no .tmod at all — it is not a tModLoader mod.
 */
export function deriveTmodNames(contentDir: string): DerivedTmod[] {
  const found = new Map<string, DerivedTmod>();
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.toLowerCase().endsWith(".tmod")) {
        const name = path.basename(entry.name, ".tmod");
        if (!found.has(name)) found.set(name, { name });
      }
    }
  };
  walk(contentDir, 0);

  if (found.size === 0) {
    throw new Error("The downloaded Workshop item contains no .tmod file — it is not a tModLoader mod.");
  }
  return Array.from(found.values());
}

/**
 * Client-only refusal gate, fail-closed on the item's own workshop.json tags:
 * tML publish tags carry "Both" (multiplayer-safe) or a client-only marker
 * ("Client" / "Client Only" — probed live: every server-relevant mod carries
 * "Both"). Unknown or missing tags pass — the sandbox boot test catches those.
 */
export function isClientOnlyWorkshopItem(contentDir: string): boolean {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(contentDir, "workshop.json"), "utf-8"));
    const tags: string[] = Array.isArray(parsed?.Tags)
      ? parsed.Tags.filter((t: unknown) => typeof t === "string")
      : [];
    return tags.some((t) => {
      const lower = t.toLowerCase();
      return lower.includes("client") && !lower.includes("both");
    });
  } catch {
    return false;
  }
}
