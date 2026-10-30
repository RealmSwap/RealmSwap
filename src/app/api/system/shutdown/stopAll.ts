type ServerLite = { id: string };

export async function stopAllRunningServers(
  findRunning: () => Promise<ServerLite[]>,
  stop: (serverId: string) => Promise<void>
): Promise<number> {
  const servers = await findRunning();
  // Stop in parallel: the app-quit budget is a single shared timeout, and a
  // serial queue of graceful stops (each up to several seconds) overran it
  // with 3+ servers running, orphaning the rest on quit.
  await Promise.allSettled(servers.map((s) => stop(s.id)));
  return servers.length;
}
