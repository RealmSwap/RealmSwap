type ServerLite = { id: string };

export async function stopAllRunningServers(
  findRunning: () => Promise<ServerLite[]>,
  stop: (serverId: string) => Promise<void>
): Promise<number> {
  const servers = await findRunning();
  for (const s of servers) {
    try {
      await stop(s.id);
    } catch {
      // best-effort: a failed stop should not block quitting the app
    }
  }
  return servers.length;
}
