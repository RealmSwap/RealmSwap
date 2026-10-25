import { Server } from "@/generated/client";

/**
 * Honesty perimeter for remote-node (AGENT) servers.
 *
 * Everything that reads or writes `<dataRoot>/local-servers/<id>` on the
 * dashboard machine describes the WRONG disk when the game container lives on
 * a node: vault archives, the mod system, the raw config editor, world
 * import/export, the SFTP panel, RealmSync invites, cloud transfer. Rather
 * than silently operating on nothing, each of those routes refuses AGENT
 * servers with a message that says what IS supported. (Backups USED to be on
 * this list — they now flow through the agent's tar/upload/restore pipeline.)
 */
export function remoteNodeRefusal(feature: string): Error {
  return new Error(
    `${feature} isn't supported for remote-node servers yet — it operates on this machine's files, ` +
    `but the server lives on its agent node. Start/stop, console, telemetry, and connection info work normally.`
  );
}

export function requireLocalServer(server: Pick<Server, "runnerType"> | { runnerType: string | null }, feature: string): void {
  if (server.runnerType === "AGENT") {
    throw remoteNodeRefusal(feature);
  }
}

/** For routes that only hold a serverId: one query, throw with the feature name. */
export async function assertLocalServer(serverId: string, feature: string): Promise<void> {
  const { prisma } = await import("@/lib/db");
  const row = await prisma.server.findUnique({
    where: { id: serverId },
    select: { runnerType: true },
  });
  if (row?.runnerType === "AGENT") {
    throw remoteNodeRefusal(feature);
  }
}
