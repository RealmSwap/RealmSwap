import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { swapDirIntoPlace, withServerLock } from "../atomicFs";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomicfs-test-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

describe("swapDirIntoPlace", () => {
  it("replaces the target with staging content and removes the old copy", () => {
    const target = path.join(dir, "world");
    const staging = path.join(dir, "world.staging");
    write(path.join(target, "old.txt"), "old");
    write(path.join(staging, "new.txt"), "new");

    swapDirIntoPlace(staging, target);

    expect(fs.readFileSync(path.join(target, "new.txt"), "utf8")).toBe("new");
    expect(fs.existsSync(path.join(target, "old.txt"))).toBe(false);
    expect(fs.existsSync(staging)).toBe(false); // renamed away
  });

  it("puts the old directory back when the final rename fails", () => {
    const target = path.join(dir, "world");
    const staging = path.join(dir, "world.staging");
    write(path.join(target, "old.txt"), "old");
    write(path.join(staging, "new.txt"), "new");

    // Fail the second rename (staging -> target) while letting the first
    // (target -> trash) succeed, simulating a disk-full mid-swap.
    const realRename = fs.renameSync;
    let calls = 0;
    (fs as any).renameSync = (...args: any[]) => {
      calls += 1;
      if (calls === 2) throw new Error("ENOSPC");
      return realRename(...(args as [string, string]));
    };
    try {
      expect(() => swapDirIntoPlace(staging, target)).toThrow("ENOSPC");
    } finally {
      (fs as any).renameSync = realRename;
    }

    // The live directory was restored from trash.
    expect(fs.readFileSync(path.join(target, "old.txt"), "utf8")).toBe("old");
    expect(fs.existsSync(staging)).toBe(true); // staging left for inspection
  });

  it("works when the target does not exist yet", () => {
    const target = path.join(dir, "fresh", "world");
    const staging = path.join(dir, "world.staging");
    write(path.join(staging, "new.txt"), "new");

    swapDirIntoPlace(staging, target);

    expect(fs.readFileSync(path.join(target, "new.txt"), "utf8")).toBe("new");
  });
});

describe("withServerLock", () => {
  it("serializes concurrent operations on the same server", async () => {
    const order: string[] = [];
    const slow = (name: string, ms: number) => async () => {
      order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${name}:end`);
    };

    await Promise.all([
      withServerLock("s1", slow("a", 30)),
      withServerLock("s1", slow("b", 5)),
    ]);

    // b must not start before a finished — interleaving is what corrupts worlds.
    expect(order.indexOf("b:start")).toBeGreaterThan(order.indexOf("a:end"));
  });

  it("does not serialize different servers", async () => {
    const order: string[] = [];
    await Promise.all([
      withServerLock("s1", async () => {
        order.push("s1:start");
        await new Promise((r) => setTimeout(r, 30));
        order.push("s1:end");
      }),
      withServerLock("s2", async () => {
        order.push("s2:start");
        order.push("s2:end");
      }),
    ]);
    expect(order.indexOf("s2:start")).toBeLessThan(order.indexOf("s1:end"));
  });

  it("a failing holder does not poison the lock for the next waiter", async () => {
    await expect(
      withServerLock("sX", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    let ran = false;
    await withServerLock("sX", async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
