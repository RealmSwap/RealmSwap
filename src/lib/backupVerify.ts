import fs from "fs";
import AdmZip from "adm-zip";

export interface BackupVerification {
  ok: boolean;
  entries: number;
  totalBytes: number;
  /** true when only a spread sample of entries was decompressed (>2 GB archive) */
  sampled?: boolean;
  error?: string;
}

const FULL_DECOMPRESS_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const SAMPLE_COUNT = 50;

// Games whose save layout we know well enough to assert a sentinel file.
// A zip of the WRONG directory (or one missing the world file itself) would
// otherwise pass a pure "opens + inflates" check and be labeled Verified.
// Games not listed here keep the generic check — a wrong sentinel would fail
// GOOD backups, so guesses stay out.
const GAME_SENTINELS: Record<string, { test: (entryName: string) => boolean; missing: string }> = {
  MINECRAFT: { test: (n) => n === "level.dat" || n.endsWith("/level.dat"), missing: "no level.dat entry (not a Minecraft world folder)" },
  VALHEIM: {
    test: (n) => /^Dedicated\.(db|fwl)$/.test(n),
    missing: "no Dedicated.db / Dedicated.fwl entry (not a Valheim dedicated world)",
  },
};

/**
 * Verify a backup zip is actually restorable: the archive opens, every entry
 * is present, and entry data decompresses (which is what a restore needs to
 * do). Below FULL_DECOMPRESS_LIMIT_BYTES every entry is decompressed; larger
 * archives get full structural validation plus a spread sample decompressed,
 * so verifying a huge world doesn't stall the scheduler for minutes.
 *
 * When `game` is passed and its save layout is known, the entry set must also
 * contain the game's world sentinel file.
 *
 * A backup that was never verified is a hope, not a backup — this is what
 * turns "zip exists" into "zip restores".
 */
export function verifyBackupFile(filePath: string, game?: string): BackupVerification {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, entries: 0, totalBytes: 0, error: "Backup file is missing on disk" };
    }

    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    if (entries.length === 0) {
      return { ok: false, entries: 0, totalBytes: 0, error: "Archive contains no entries" };
    }

    const sentinel = game ? GAME_SENTINELS[game.toUpperCase()] : undefined;
    if (sentinel && !entries.some((e) => sentinel.test(e.entryName))) {
      return { ok: false, entries: entries.length, totalBytes: 0, error: `Archive is missing the world file: ${sentinel.missing}` };
    }

    const totalBytes = entries.reduce((sum, e) => sum + e.header.size, 0);

    const sampled = totalBytes > FULL_DECOMPRESS_LIMIT_BYTES;
    const toCheck = sampled ? sampleEntries(entries, SAMPLE_COUNT) : entries;

    for (const entry of toCheck) {
      if (entry.isDirectory) continue;
      // getData() forces full inflation of the entry — a corrupt deflate
      // stream or bad CRC throws here instead of during a real restore.
      entry.getData();
    }

    return { ok: true, entries: entries.length, totalBytes, sampled: sampled || undefined };
  } catch (err: any) {
    return { ok: false, entries: 0, totalBytes: 0, error: err?.message || String(err) };
  }
}

function sampleEntries<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(items[Math.floor((i * items.length) / count)]);
  }
  return out;
}
