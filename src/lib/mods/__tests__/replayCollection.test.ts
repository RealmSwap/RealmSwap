import { describe, it, expect, vi, beforeEach } from "vitest";

// Loader-conflict pre-check: a realm pinning a DIFFERENT loader than the
// server runs must refuse before any snapshot is spent.

const bag = { marker: null as any };

vi.mock("@/lib/mods/mcLoaders", () => ({
  readLoaderMarker: vi.fn(() => bag.marker),
}));

import { checkLoaderConflict } from "../replayCollection";

beforeEach(() => {
  bag.marker = null;
});

describe("checkLoaderConflict", () => {
  it("refuses a loader flip on an existing MC install", () => {
    bag.marker = { type: "forge", loaderVersion: "21.1.100", minecraftVersion: "1.21.1" };
    const err = checkLoaderConflict("MINECRAFT", "/tmp/srv", {
      type: "fabric", loaderVersion: "0.20.1", minecraftVersion: "1.21.1",
    });
    expect(err).toMatch(/pins the Fabric loader.*runs Forge/);
  });

  it("allows the same loader and fresh installs", () => {
    bag.marker = { type: "fabric", loaderVersion: "0.20.0", minecraftVersion: "1.21.1" };
    expect(checkLoaderConflict("MINECRAFT", "/tmp/srv", { type: "fabric", loaderVersion: "0.20.1" })).toBeNull();
    bag.marker = null; // fresh install — any loader is fine
    expect(checkLoaderConflict("MINECRAFT", "/tmp/srv", { type: "neoforge", loaderVersion: "21.1.90" })).toBeNull();
  });

  it("ignores non-MC games", () => {
    expect(checkLoaderConflict("VALHEIM", "/tmp/srv", { type: "forge", loaderVersion: "x" })).toBeNull();
    expect(checkLoaderConflict("MINECRAFT", "/tmp/srv", null)).toBeNull();
  });
});
