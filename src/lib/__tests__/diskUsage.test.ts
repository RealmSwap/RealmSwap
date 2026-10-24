import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getFolderSizeBytes,
  getServerDiskBytes,
  getServerDir,
  bytesToGB,
  bytesToMB,
  DISK_WALK_TTL_MS,
} from "../diskUsage";

/**
 * Real disk usage — the lib behind the hero card's Disk tile. The tile used
 * to render a hardcoded "~1.2G", a fixed 25% bar and a constant sparkline;
 * these tests pin the honest replacement.
 */

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "diskusage-"));
  process.env.GAMEVAULT_DATA_DIR = tmpRoot;
});

afterAll(() => {
  delete process.env.GAMEVAULT_DATA_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("getFolderSizeBytes", () => {
  it("sums files across nested directories", async () => {
    const dir = path.join(tmpRoot, "nested");
    fs.mkdirSync(path.join(dir, "world", "region"), { recursive: true });
    fs.writeFileSync(path.join(dir, "server.jar"), Buffer.alloc(100));
    fs.writeFileSync(path.join(dir, "world", "level.dat"), Buffer.alloc(50));
    fs.writeFileSync(path.join(dir, "world", "region", "r.0.mca"), Buffer.alloc(25));

    expect(await getFolderSizeBytes(dir)).toBe(175);
  });

  it("returns 0 for an empty directory", async () => {
    const dir = path.join(tmpRoot, "empty");
    fs.mkdirSync(dir);
    expect(await getFolderSizeBytes(dir)).toBe(0);
  });

  it("returns null for a missing path and for a plain file", async () => {
    expect(await getFolderSizeBytes(path.join(tmpRoot, "nope"))).toBeNull();
    const file = path.join(tmpRoot, "plain.txt");
    fs.writeFileSync(file, "x");
    expect(await getFolderSizeBytes(file)).toBeNull();
  });

  it("never follows symlinks", async () => {
    const dir = path.join(tmpRoot, "symdir");
    const outside = path.join(tmpRoot, "outside.bin");
    fs.mkdirSync(dir);
    fs.writeFileSync(outside, Buffer.alloc(1000));
    fs.writeFileSync(path.join(dir, "own.bin"), Buffer.alloc(10));
    try {
      fs.symlinkSync(outside, path.join(dir, "link.bin"));
    } catch {
      return; // filesystem without symlink support — nothing to prove here
    }
    expect(await getFolderSizeBytes(dir)).toBe(10);
  });
});

describe("getServerDiskBytes (cache layer)", () => {
  it("walks the server folder under the data root when fresh", async () => {
    const id = "srv-fresh-1";
    const dir = getServerDir(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.bin"), Buffer.alloc(2048));

    expect(await getServerDiskBytes(id, { awaitFresh: true })).toBe(2048);
  });

  it("returns null when the server has no local folder", async () => {
    expect(await getServerDiskBytes("srv-missing-1", { awaitFresh: true })).toBeNull();
  });

  it("serves the last known value without a re-walk when the cache is warm", async () => {
    const id = "srv-warm-1";
    const dir = getServerDir(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.bin"), Buffer.alloc(500));

    expect(await getServerDiskBytes(id, { awaitFresh: true })).toBe(500);

    // Folder vanishes (e.g. server vaulted) — a non-fresh sample still
    // returns the last known size instead of blocking on a walk.
    fs.rmSync(dir, { recursive: true, force: true });
    expect(await getServerDiskBytes(id)).toBe(500);
  });

  it("re-walks once the TTL lapses", async () => {
    const id = "srv-ttl-1";
    const dir = getServerDir(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "a.bin"), Buffer.alloc(100));

    expect(await getServerDiskBytes(id, { awaitFresh: true })).toBe(100);

    // Age the cache entry past the TTL by rewriting its timestamp directly —
    // the cache is keyed per server so no other test bleeds in.
    const g = globalThis as any;
    const entry = g.diskSizeCache?.get?.(id);
    expect(entry).toBeDefined();
    entry.at = Date.now() - DISK_WALK_TTL_MS - 1000;

    fs.writeFileSync(path.join(dir, "b.bin"), Buffer.alloc(400));
    expect(await getServerDiskBytes(id, { awaitFresh: true })).toBe(500);
  });
});

describe("unit conversions", () => {
  it("converts bytes to GB and MB", () => {
    expect(bytesToGB(3.5 * 1024 * 1024 * 1024)).toBe(3.5);
    expect(bytesToGB(null)).toBeNull();
    expect(bytesToMB(2 * 1024 * 1024)).toBe(2);
    expect(bytesToMB(null)).toBeNull();
  });
});
