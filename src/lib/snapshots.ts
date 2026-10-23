import fs from "fs";
import path from "path";
import { dataRoot } from "./appPaths";
import { prisma } from "./db";
import { swapDirIntoPlace, withServerLock } from "./atomicFs";
import { reconcileInstalledMods } from "./mods/reconcile";

/**
 * Creates a complete snapshot of a server's state on disk.
 */
export async function createSnapshot(serverId: string, userId: string, name: string): Promise<any> {
  return withServerLock(serverId, async () => {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new Error("Server not found");

    const sourceDir = path.join(dataRoot(), "local-servers", serverId);
    if (!fs.existsSync(sourceDir)) {
      fs.mkdirSync(sourceDir, { recursive: true });
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
    // Copy into a staging dir and rename into place so a failed or
    // interrupted copy can never leave a half-written snapshot directory
    // that a later restore would trust.
    const stagingDir = `${destDir}.staging`;
    fs.rmSync(stagingDir, { recursive: true, force: true });

    try {
      fs.cpSync(sourceDir, stagingDir, { recursive: true, force: true });
      fs.renameSync(stagingDir, destDir);

      const updatedSnapshot = await prisma.serverSnapshot.update({
        where: { id: snapshot.id },
        data: { path: destDir }
      });

      return updatedSnapshot;
    } catch (err) {
      // Never leave a row pointing at nothing — restoring a `path: ""` row
      // would destroy the server dir and fail the copy afterwards.
      fs.rmSync(stagingDir, { recursive: true, force: true });
      try {
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      } catch (_) {}
      await prisma.serverSnapshot.delete({ where: { id: snapshot.id } }).catch(() => {});
      throw err;
    }
  });
}

/**
 * Restores a snapshot by completely replacing the server's current directory with the snapshot's directory.
 */
export async function restoreSnapshot(snapshotId: string): Promise<void> {
  const snapshot = await prisma.serverSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new Error("Snapshot not found");

  // A snapshot row whose folder is missing or empty must never get as far as
  // touching the live server directory.
  if (!snapshot.path || !fs.existsSync(snapshot.path)) {
    throw new Error(`Snapshot folder is missing on disk (${snapshot.path || "no path recorded"}) — restore aborted before the server directory was touched.`);
  }
  if (fs.readdirSync(snapshot.path).length === 0) {
    throw new Error("Snapshot folder is empty — restore aborted before the server directory was touched.");
  }

  const serverDir = path.join(dataRoot(), "local-servers", snapshot.serverId);

  await withServerLock(snapshot.serverId, async () => {
    // Copy the snapshot into a staging dir first, then swap it into place.
    // The previous directory is only deleted once the replacement is fully
    // copied, so a mid-copy failure (disk full, snapshots dir gone) leaves
    // the live server directory intact.
    const stagingDir = `${serverDir}.snapshot-staging`;
    fs.rmSync(stagingDir, { recursive: true, force: true });
    try {
      fs.cpSync(snapshot.path, stagingDir, { recursive: true, force: true });
      swapDirIntoPlace(stagingDir, serverDir);
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  });

  // The restored directory is now the source of truth for what's installed.
  // Rows are repaired to match it so the Installed tab doesn't list mods that
  // were rolled away or miss mods that came back. Best-effort: the restore
  // itself already succeeded, so a reconciliation failure must not undo it.
  try {
    await reconcileInstalledMods(snapshot.serverId);
  } catch (err) {
    console.error("Post-restore mod reconciliation failed:", err);
  }
}

/**
 * Delete a snapshot row together with its folder on disk. Rollback paths in
 * the mod routes restore a snapshot and then discard it — without this the
 * copied directory under snapshots/ leaked on every install.
 */
export async function discardSnapshot(snapshotId: string): Promise<void> {
  const snapshot = await prisma.serverSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) return;
  if (snapshot.path) {
    try {
      fs.rmSync(snapshot.path, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to delete snapshot folder ${snapshot.path}:`, err);
    }
  }
  await prisma.serverSnapshot.delete({ where: { id: snapshotId } }).catch(() => {});
}
