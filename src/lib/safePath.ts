import path from "path";

/**
 * Safely joins paths while preventing directory traversal attacks.
 * @param rootDir The absolute path to the intended root directory.
 * @param targetPaths User-supplied or untrusted path segments.
 * @returns The absolute safe path, or throws an error if traversal is detected.
 */
export function safeJoin(rootDir: string, ...targetPaths: string[]): string {
  // Resolve the root to absolute to normalize it
  const safeRoot = path.resolve(rootDir);
  
  // Join the untrusted segments and resolve relative to the safe root
  const targetPath = path.join(...targetPaths);
  const resolvedPath = path.resolve(safeRoot, targetPath);
  
  // Ensure the resolved path starts with the safe root
  // We append path.sep to prevent sibling directory attacks (e.g. root: /data/servers, attacker: /data/servers2)
  if (!resolvedPath.startsWith(safeRoot + path.sep) && resolvedPath !== safeRoot) {
    throw new Error("Path traversal detected! Attempted to escape the root directory.");
  }
  
  return resolvedPath;
}
