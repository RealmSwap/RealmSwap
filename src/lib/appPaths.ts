/**
 * Root directory for all writable app data (database, installed servers,
 * steamcmd, backups, archives).
 *
 * In a packaged Electron build the main process sets GAMEVAULT_DATA_DIR to the
 * OS userData dir (e.g. %APPDATA%/GameVault). In dev / plain `next` runs the
 * variable is unset and we fall back to the current working directory, which
 * preserves the original behavior exactly.
 */
export function dataRoot(): string {
  const fromEnv = process.env.GAMEVAULT_DATA_DIR;
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv;
  }
  return process.cwd();
}
