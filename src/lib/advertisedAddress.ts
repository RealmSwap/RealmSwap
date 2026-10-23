/**
 * The address friends should use to reach a game server.
 *
 * A live playit tunnel wins — it works regardless of router config — then
 * the server's recorded ipAddress (the public IP when direct access works,
 * LAN otherwise), then loopback. `tunnelActive` must be real liveness where
 * the caller can know it (API process: isTunnelAlive); the bot process
 * runs separately and can only trust the DB flag.
 */
export function advertisedGameAddress(
  server: { tunnelUrl?: string | null; ipAddress?: string | null; port: number },
  tunnelActive: boolean
): string {
  if (tunnelActive && server.tunnelUrl) return server.tunnelUrl;
  if (server.ipAddress) return `${server.ipAddress}:${server.port}`;
  return `127.0.0.1:${server.port}`;
}
