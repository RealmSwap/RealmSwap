import { describe, it, expect } from "vitest";
import { expandCover, minimalCover, toggleSelection } from "../FilePickerTree";

// Directory entries are represented in allPaths just like file entries (a
// FileEntry with isDir: true has its own relPath), so a fully-listed tree
// includes intermediate directory paths such as "world/region" alongside
// their contents.
const allPaths = ["world", "world/level.dat", "world/region", "world/region/r.mca", "libraries/foo.jar"];

describe("expandCover", () => {
  it("expands a cover path to itself and all its descendants present in allPaths", () => {
    const set = expandCover(["world"], allPaths);
    expect(set.has("world")).toBe(true);
    expect(set.has("world/level.dat")).toBe(true);
    expect(set.has("world/region/r.mca")).toBe(true);
    expect(set.has("libraries/foo.jar")).toBe(false);
  });

  it("returns an empty set for an empty cover", () => {
    const set = expandCover([], allPaths);
    expect(set.size).toBe(0);
  });
});

describe("minimalCover", () => {
  it("collapses a fully-covered subtree to its top folder", () => {
    const set = new Set(["world", "world/level.dat", "world/region", "world/region/r.mca"]);
    expect(minimalCover(set)).toEqual(["world"]);
  });

  it("keeps independent top-level selections that have no covered parent", () => {
    const set = new Set(["a/b", "c"]);
    expect(minimalCover(set)).toEqual(["a/b", "c"]);
  });
});

describe("expandCover + minimalCover round-trip", () => {
  it("collapses back to the original cover", () => {
    const expanded = expandCover(["world"], allPaths);
    expect(minimalCover(expanded)).toEqual(["world"]);
  });
});

describe("toggleSelection", () => {
  const worldPaths = ["world", "world/keep.dat", "world/level.dat", "world/unwanted.dat"];

  it("persists unchecking a child under a checked folder", () => {
    const selected = expandCover(["world"], worldPaths);
    const cover = toggleSelection(selected, "world/unwanted.dat", []);
    const reExpanded = expandCover(cover, worldPaths);
    expect(reExpanded.has("world/unwanted.dat")).toBe(false);
    expect(reExpanded.has("world/keep.dat")).toBe(true);
    expect(reExpanded.has("world/level.dat")).toBe(true);
  });

  it("clears the whole subtree when toggling a folder off", () => {
    const selected = expandCover(["world"], worldPaths);
    const cover = toggleSelection(selected, "world", ["world/keep.dat", "world/level.dat", "world/unwanted.dat"]);
    expect(cover).toEqual([]);
  });

  it("adds an unchecked file when toggled on", () => {
    const selected = new Set<string>();
    const cover = toggleSelection(selected, "world/keep.dat", []);
    expect(cover).toEqual(["world/keep.dat"]);
  });
});
