import path from "path";

/**
 * Resolved on-disk locations a backup reads from / restores to for a server.
 *
 * - `srcDir`: directory whose contents are snapshotted.
 * - `zipPattern`: glob of files inside `srcDir` to archive.
 * - `destExtractDir`: directory a restore extracts back into.
 */
export type SavePaths = {
  srcDir: string;
  zipPattern: string;
  destExtractDir: string;
};

/**
 * Map a game type to its local save paths. Pure: the filesystem roots are
 * injected (`dataRoot` for app-managed servers, `userProfile` for games that
 * save under the Windows user profile) so the per-game path logic is testable
 * without touching real config or the DB.
 */
export function getSavePath(
  game: string,
  serverId: string,
  roots: { dataRoot: string; userProfile: string }
): SavePaths {
  const root = roots.dataRoot;

  switch (game.toUpperCase()) {
    case "MINECRAFT": {
      const dir = path.join(root, "local-servers", serverId, "world");
      return { srcDir: dir, zipPattern: `${dir}/*`, destExtractDir: dir };
    }
    case "VALHEIM": {
      // Valheim runner boots with -world Dedicated, so files are Dedicated.db and Dedicated.fwl
      const dir = path.join(
        roots.userProfile,
        "AppData",
        "LocalLow",
        "IronGate",
        "Valheim",
        "worlds_local"
      );
      return { srcDir: dir, zipPattern: `${dir}/Dedicated.*`, destExtractDir: dir };
    }
    case "ENSHROUDED": {
      const dir = path.join(root, "local-servers", serverId, "enshrouded-server", "savegame");
      return { srcDir: dir, zipPattern: `${dir}/*`, destExtractDir: dir };
    }
    case "ZOMBOID": {
      const dir = path.join(
        root,
        "local-servers",
        serverId,
        "zomboid-server",
        "zomboid-data",
        "Saves",
        "Multiplayer",
        "servertest"
      );
      return { srcDir: dir, zipPattern: `${dir}/*`, destExtractDir: dir };
    }
    case "ARK": {
      const dir = path.join(
        root,
        "local-servers",
        serverId,
        "ark-server",
        "ShooterGame",
        "Saved",
        "SavedArksLocal"
      );
      return { srcDir: dir, zipPattern: `${dir}/*`, destExtractDir: dir };
    }
    default:
      throw new Error(`Unsupported game type: ${game}`);
  }
}
