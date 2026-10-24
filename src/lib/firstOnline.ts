import { prisma } from "./db";

/**
 * Stamp the first time a server reaches RUNNING. The conditional update makes
 * it idempotent — every readiness path (Local, Docker, Windrose) can call it
 * on every start; only the first one for a server's lifetime writes. The
 * dashboard watches for a fresh firstOnlineAt to fire the first-boot
 * celebration.
 */
export async function markFirstOnline(serverId: string): Promise<boolean> {
  const result = await prisma.server.updateMany({
    where: { id: serverId, firstOnlineAt: null },
    data: { firstOnlineAt: new Date() },
  });
  return result.count > 0;
}
