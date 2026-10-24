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

/**
 * Path prefix the Docker daemon sees for server data bind mounts.
 *
 * When the dashboard itself runs inside a container, dataRoot() (e.g. /data)
 * is a container-internal path that does not exist on the host — passing it to
 * `docker run -v` would mount an empty directory. GAMEVAULT_HOST_DATA_DIR is
 * the host-side path of the same volume, so game containers mount real data.
 * Unset (desktop / native runs), mounts use dataRoot() exactly as before.
 */
export function dockerMountRoot(): string {
  const fromEnv = process.env.GAMEVAULT_HOST_DATA_DIR;
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  return dataRoot();
}

/**
 * Host the dashboard uses to reach running game servers (gamedig queries,
 * RCON). Published ports land on the machine's loopback for desktop/native
 * runs; from a containerized dashboard they are reachable via the host
 * gateway, so compose sets GAMEVAULT_GAME_HOST=host.docker.internal.
 */
export function gameHost(): string {
  const fromEnv = process.env.GAMEVAULT_GAME_HOST;
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  return "127.0.0.1";
}
