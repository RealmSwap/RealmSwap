import path from "path";

export interface StorageLocation {
  key: string;
  label: string;
  /** Absolute path. */
  path: string;
  /** When true this is a file; callers open its containing folder. */
  isFile?: boolean;
}

/**
 * Ordered list of well-known writable locations under the app data root.
 * Mirrors the layout produced across the app (local-servers, local-backups,
 * snapshots, steamcmd) plus the database file.
 */
export function storageLocationPaths(root: string): StorageLocation[] {
  return [
    { key: "dataRoot", label: "Data folder", path: root },
    { key: "database", label: "Database", path: path.join(root, "realmswap.db"), isFile: true },
    { key: "servers", label: "Servers", path: path.join(root, "local-servers") },
    { key: "backups", label: "Backups", path: path.join(root, "local-backups") },
    { key: "snapshots", label: "Snapshots", path: path.join(root, "snapshots") },
    { key: "steamcmd", label: "SteamCMD", path: path.join(root, "steamcmd") },
  ];
}

/**
 * Resolve a whitelisted location key to the absolute folder to open. File
 * targets resolve to their containing folder. Unknown keys return null.
 */
export function resolveStorageTarget(key: string, root: string): string | null {
  const loc = storageLocationPaths(root).find((l) => l.key === key);
  if (!loc) return null;
  return loc.isFile ? path.dirname(loc.path) : loc.path;
}

/** True if `target` equals the root or is nested inside it (blocks traversal). */
export function isInsideRoot(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  if (t === r) return true;
  const rel = path.relative(r, t);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** OS file-manager command that reveals a folder. */
export function openFolderCommand(
  platform: NodeJS.Platform,
  target: string
): { cmd: string; args: string[] } {
  if (platform === "win32") return { cmd: "explorer", args: [target] };
  if (platform === "darwin") return { cmd: "open", args: [target] };
  return { cmd: "xdg-open", args: [target] };
}
