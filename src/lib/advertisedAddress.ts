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

export type AddressPath = "tunnel" | "public" | "lan" | "loopback";

/**
 * Which route the advertised address takes, so the UI can be honest about
 * what friends are connecting through: the playit relay (home IP stays
 * private), the home's public IP (works, but it's exposed), the LAN, or a
 * local-only loopback. Unparseable addresses classify as "public" — the
 * privacy warning is the safe direction to be wrong in.
 */
export function classifyAddressPath(
  server: { tunnelUrl?: string | null; ipAddress?: string | null; port: number },
  tunnelActive: boolean
): AddressPath {
  if (tunnelActive && server.tunnelUrl) return "tunnel";
  const ip = (server.ipAddress ?? "").trim();
  if (!ip) return "loopback";
  // Strip IPv6 brackets and zone indices ("fe80::1%en0").
  const host = ip.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (host === "::1" || /^127\./.test(host)) return "loopback";
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) return "lan";
  return "public";
}

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  if (a === 10) return true; // RFC1918 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // link-local: no DHCP lease, LAN-only at best
  return false;
}

function isPrivateIPv6(host: string): boolean {
  if (host === "::1") return true;
  return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host); // fc00::/7 ULA + fe80::/10 link-local
}
