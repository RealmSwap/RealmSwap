import { describe, it, expect } from "vitest";
import { mergeListFile, renderConsole, resolvePlayerId } from "../listFormat";

describe("mergeListFile lineList", () => {
  it("adds an id to an empty file", () => {
    expect(mergeListFile("", "76561", "add", "lineList")).toBe("76561\n");
  });
  it("is idempotent on add", () => {
    expect(mergeListFile("76561\n", "76561", "add", "lineList")).toBe("76561\n");
  });
  it("preserves existing entries and appends", () => {
    expect(mergeListFile("aaa\n", "bbb", "add", "lineList")).toBe("aaa\nbbb\n");
  });
  it("removes an id and leaves the rest", () => {
    expect(mergeListFile("aaa\nbbb\n", "aaa", "remove", "lineList")).toBe("bbb\n");
  });
  it("ignores blank lines and comments on parse", () => {
    expect(mergeListFile("// list\naaa\n\n", "bbb", "add", "lineList")).toBe("// list\naaa\nbbb\n");
  });
});

describe("mergeListFile jsonArray of strings", () => {
  it("adds to an empty/invalid file as a fresh array", () => {
    expect(mergeListFile("", "x", "add", "jsonArray")).toBe(JSON.stringify(["x"], null, 2));
  });
  it("dedupes on add", () => {
    const start = JSON.stringify(["x"], null, 2);
    expect(mergeListFile(start, "x", "add", "jsonArray")).toBe(start);
  });
  it("removes", () => {
    const start = JSON.stringify(["x", "y"], null, 2);
    expect(mergeListFile(start, "x", "remove", "jsonArray")).toBe(JSON.stringify(["y"], null, 2));
  });
});

describe("mergeListFile jsonArray of objects (field)", () => {
  it("adds an object keyed by field", () => {
    const out = mergeListFile("", "Steve", "add", "jsonArray", "name");
    expect(JSON.parse(out)).toEqual([{ name: "Steve" }]);
  });
  it("dedupes by field value", () => {
    const start = JSON.stringify([{ name: "Steve" }], null, 2);
    expect(mergeListFile(start, "Steve", "add", "jsonArray", "name")).toBe(start);
  });
  it("removes by field value", () => {
    const start = JSON.stringify([{ name: "Steve" }, { name: "Alex" }], null, 2);
    expect(JSON.parse(mergeListFile(start, "Steve", "remove", "jsonArray", "name"))).toEqual([{ name: "Alex" }]);
  });
});

describe("renderConsole", () => {
  it("substitutes id and reason", () => {
    expect(renderConsole("ban {id} {reason}", { id: "Steve", reason: "Griefing" })).toBe("ban Steve Griefing");
  });
  it("blanks missing reason", () => {
    expect(renderConsole("whitelist add {id}", { id: "Steve" })).toBe("whitelist add Steve");
  });
});

describe("resolvePlayerId", () => {
  it("returns the requested identity field", () => {
    expect(resolvePlayerId({ steamId: "76561" }, "steamId")).toBe("76561");
  });
  it("returns null when the identity field is missing", () => {
    expect(resolvePlayerId({ steamId: null }, "steamId")).toBeNull();
  });
});
