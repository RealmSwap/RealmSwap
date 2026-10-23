import { describe, it, expect } from "vitest";
import { beginSaveFlush, getSaveFlushPlan, pickBackupsToPrune, SaveFlushPlan } from "../saveFlush";

describe("getSaveFlushPlan", () => {
  it("gives Minecraft a quiesce + flush + resume plan", () => {
    expect(getSaveFlushPlan("MINECRAFT")).toEqual({
      pre: ["save-off", "save-all flush"],
      post: ["save-on"],
    });
  });

  it("gives Palworld and Zomboid a forced save", () => {
    expect(getSaveFlushPlan("palworld")!.pre).toEqual(["save"]);
    expect(getSaveFlushPlan("ZOMBOID")!.pre).toEqual(["save"]);
  });

  it("returns null for games without a reliable RCON save command", () => {
    for (const game of ["VALHEIM", "RUST", "ARK", "TERRARIA", "ENSHROUDED", "UNKNOWN_GAME"]) {
      expect(getSaveFlushPlan(game)).toBeNull();
    }
  });
});

describe("beginSaveFlush", () => {
  const plan: SaveFlushPlan = { pre: ["save-off", "save-all flush"], post: ["save-on"] };

  it("runs pre commands in order and defers post commands to resume()", async () => {
    const sent: string[] = [];
    const session = await beginSaveFlush(plan, async (cmd) => {
      sent.push(cmd);
      return "ok";
    });

    expect(session.flushed).toBe(true);
    expect(session.error).toBeUndefined();
    expect(sent).toEqual(["save-off", "save-all flush"]);

    await session.resume();
    expect(sent).toEqual(["save-off", "save-all flush", "save-on"]);
  });

  it("rolls the plan back immediately when a pre command fails", async () => {
    const sent: string[] = [];
    const session = await beginSaveFlush(plan, async (cmd) => {
      sent.push(cmd);
      // The executor mirrors rconManager: transport failures become null.
      return cmd === "save-all flush" ? null : "ok";
    });

    expect(session.flushed).toBe(false);
    expect(session.error).toContain("save-all flush");
    // save-on was already sent so autosave is never left off; resume is inert.
    expect(sent).toEqual(["save-off", "save-all flush", "save-on"]);
    await session.resume();
    expect(sent).toEqual(["save-off", "save-all flush", "save-on"]);
  });

  it("treats a throwing executor as failure and still resumes", async () => {
    const sent: string[] = [];
    const session = await beginSaveFlush(plan, async (cmd) => {
      sent.push(cmd);
      if (cmd === "save-off") throw new Error("socket closed");
      return "ok";
    });

    expect(session.flushed).toBe(false);
    expect(sent).toEqual(["save-off", "save-on"]);
  });

  it("swallows failures of post commands so resume never masks the backup result", async () => {
    const session = await beginSaveFlush(plan, async (cmd) => (cmd === "save-on" ? null : "ok"));
    expect(session.flushed).toBe(true);
    await expect(session.resume()).resolves.toBeUndefined();
  });
});

interface Row {
  id: string;
  verifiedAt: Date | null;
}

function rows(specs: Array<[string, boolean]>): Row[] {
  return specs.map(([id, verified]) => ({ id, verifiedAt: verified ? new Date() : null }));
}

describe("pickBackupsToPrune", () => {
  it("keeps everything when retention is 0 (unlimited)", () => {
    const list = rows([["a", true], ["b", false]]);
    expect(pickBackupsToPrune(list, 0)).toEqual([]);
  });

  it("keeps everything when the list fits the window", () => {
    const list = rows([["a", true], ["b", true], ["c", false]]);
    expect(pickBackupsToPrune(list, 3)).toEqual([]);
  });

  it("deletes the oldest beyond the window", () => {
    const list = rows([["n1", true], ["n2", true], ["n3", false], ["n4", true], ["n5", false]]);
    expect(pickBackupsToPrune(list, 3).map((r) => r.id)).toEqual(["n4", "n5"]);
  });

  it("never deletes the newest verified backup even if it falls outside the window", () => {
    // Only n4 is verified; keep-last-2 alone would delete it, which would
    // destroy the only proven-restorable restore point.
    const list = rows([["n1", false], ["n2", false], ["n3", false], ["n4", true], ["n5", false]]);
    expect(pickBackupsToPrune(list, 2).map((r) => r.id)).toEqual(["n3", "n5"]);
  });

  it("does not rescue when the newest verified backup is inside the window", () => {
    const list = rows([["n1", true], ["n2", false], ["n3", false], ["n4", false], ["n5", false]]);
    expect(pickBackupsToPrune(list, 2).map((r) => r.id)).toEqual(["n3", "n4", "n5"]);
  });

  it("can still delete everything when no backup is verified", () => {
    const list = rows([["n1", false], ["n2", false], ["n3", false]]);
    expect(pickBackupsToPrune(list, 1).map((r) => r.id)).toEqual(["n2", "n3"]);
  });
});
