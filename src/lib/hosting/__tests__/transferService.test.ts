import { describe, it, expect } from "vitest";
import { executeTransfer, TransferContext } from "../transferService";
import { FileEntry, Transferer } from "../types";

const f = (relPath: string, size: number, mtimeMs: number): FileEntry => ({ relPath, size, mtimeMs, isDir: false });

function baseCtx(over: Partial<TransferContext> = {}): TransferContext {
  const copied: string[] = [];
  const transferer: Transferer = {
    async mkdir() {},
    async copy(rel) { copied.push(rel); },
  };
  return {
    excludeConfig: false,
    localEntries: [f("world/level.dat", 10, 100), f("server.properties", 5, 100)],
    remoteEntries: [],
    sizesFor: (entries: FileEntry[]) => new Map(entries.map((e) => [e.relPath, e.size])),
    makeTransferer: () => transferer,
    onProgress: () => {},
    _copied: copied,
    ...over,
  } as any;
}

describe("executeTransfer", () => {
  it("PUSH plans local->remote and copies missing files", async () => {
    const ctx = baseCtx();
    const summary = await executeTransfer("PUSH", ctx);
    expect((ctx as any)._copied.sort()).toEqual(["server.properties", "world/level.dat"]);
    expect(summary.filesTransferred).toBe(2);
  });

  it("excludeConfig skips server.properties", async () => {
    const ctx = baseCtx({ excludeConfig: true });
    await executeTransfer("PUSH", ctx);
    expect((ctx as any)._copied).not.toContain("server.properties");
  });

  it("PULL plans remote->local", async () => {
    const ctx = baseCtx({
      localEntries: [],
      remoteEntries: [f("world/level.dat", 10, 100)],
    });
    const summary = await executeTransfer("PULL", ctx);
    expect((ctx as any)._copied).toEqual(["world/level.dat"]);
    expect(summary.filesTransferred).toBe(1);
  });
});
