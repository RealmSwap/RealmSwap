import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";
import { prisma } from "./db";

/**
 * Creates a complete snapshot of a server's state on disk.
 */
export async function createSnapshot(serverId: string, userId: string, name: string): Promise<any> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) throw new Error("Server not found");

  const sourceDir = path.join(dataRoot(), "local-servers", serverId);
  if (!fs.existsSync(sourceDir)) {
    throw new Error("Server directory does not exist on disk.");
  }

  // Count mods (just an example, in reality we'd count rows in DB or files)
  const modCount = await prisma.modInstallation.count({ where: { serverId } });

  const snapshot = await prisma.serverSnapshot.create({
    data: {
      serverId,
      userId,
      name,
      path: "", // We will update this
      modCount,
    }
  });

  const destDir = path.join(dataRoot(), "snapshots", snapshot.id);
  
  // Perform the copy (synchronous for simplicity in this MVP, but cpSync is available in newer node)
  fs.cpSync(sourceDir, destDir, { recursive: true, force: true });

  const updatedSnapshot = await prisma.serverSnapshot.update({
    where: { id: snapshot.id },
    data: { path: destDir }
  });

  return updatedSnapshot;
}

/**
 * Restores a snapshot by completely replacing the server's current directory with the snapshot's directory.
 */
export async function restoreSnapshot(snapshotId: string): Promise<void> {
  const snapshot = await prisma.serverSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new Error("Snapshot not found");

  const serverDir = path.join(dataRoot(), "local-servers", snapshot.serverId);
  
  if (fs.existsSync(serverDir)) {
    fs.rmSync(serverDir, { recursive: true, force: true });
  }

  // Copy snapshot back to server dir
  fs.cpSync(snapshot.path, serverDir, { recursive: true, force: true });
}
