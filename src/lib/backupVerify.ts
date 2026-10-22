import fs from "fs";
import AdmZip from "adm-zip";

export interface BackupVerification {
  ok: boolean;
  entries: number;
  totalBytes: number;
  error?: string;
}

const FULL_DECOMPRESS_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const SAMPLE_COUNT = 50;

/**
 * Verify a backup zip is actually restorable: the archive opens, every entry
 * is present, and entry data decompresses (which is what a restore needs to
 * do). Below FULL_DECOMPRESS_LIMIT_BYTES every entry is decompressed; larger
 * archives get full structural validation plus a spread sample decompressed,
 * so verifying a huge world doesn't stall the scheduler for minutes.
 *
 * A backup that was never verified is a hope, not a backup — this is what
 * turns "zip exists" into "zip restores".
 */
export function verifyBackupFile(filePath: string): BackupVerification {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, entries: 0, totalBytes: 0, error: "Backup file is missing on disk" };
    }

    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    if (entries.length === 0) {
      return { ok: false, entries: 0, totalBytes: 0, error: "Archive contains no entries" };
    }

    const totalBytes = entries.reduce((sum, e) => sum + e.header.size, 0);

    const toCheck =
      totalBytes <= FULL_DECOMPRESS_LIMIT_BYTES
        ? entries
        : sampleEntries(entries, SAMPLE_COUNT);

    for (const entry of toCheck) {
      if (entry.isDirectory) continue;
      // getData() forces full inflation of the entry — a corrupt deflate
      // stream or bad CRC throws here instead of during a real restore.
      entry.getData();
    }

    return { ok: true, entries: entries.length, totalBytes };
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
