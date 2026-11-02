import { describe, it, expect, vi, beforeEach } from "vitest";

// Publish-from-server extraction: the payload must be the machine-readable
// truth of what the server runs — pack-owned mods summarized by the pack
// reference, standalone mods pinned individually, loader from the marker,
// secrets-free (no config capture at all).

const bag = {
  server: null as any,
  marker: null as any,
  tml: null as any,
};

vi.mock("@/lib/db", () => ({
  prisma: {
    server: {
      findUnique: async () => bag.server,
    },
  },
}));

vi.mock("@/lib/mods/mcLoaders", () => ({
  readLoaderMarker: vi.fn(() => bag.marker),
}));

vi.mock("@/lib/mods/tml", () => ({
  readTmlMarker: vi.fn(() => bag.tml),
  tmlInstallDir: (root: string) => `${root}/tmodloader`,
}));

vi.mock("@/lib/appPaths", () => ({
  dataRoot: () => "/tmp/fake-data-root",
}));

import { buildRealmPayloadFromServer } from "../extract";

beforeEach(() => {
  bag.marker = null;
  bag.tml = null;
  bag.server = {
    id: "srv1",
    game: "MINECRAFT",
    name: "Dragonhold - Deployed",
    paramValues: null,
    definition: null,
    mods: [],
    modpack: null,
  };
});

describe("buildRealmPayloadFromServer", () => {
  it("extracts a pack realm: pack ref summarized, extras pinned, name suffix stripped", async () => {
    bag.server.mods = [
      { disabled: false, provider: "curseforge", packageId: "1", name: "pack-mod-a", version: "1.2.0", workshopModId: null },
      { disabled: false, provider: "modrinth", packageId: "extra-mod", name: "Extra Mod", version: "3.4.1", workshopModId: null },
    ];
    bag.server.modpack = {
      kind: "curseforge",
      projectId: "907066",
      fileId: 555001,
      packName: "All the Mods 10",
      version: "1.0.2",
      mcVersion: "1.21.1",
      loaderType: "forge",
      loaderVersion: "21.1.100",
      packageIds: JSON.stringify(["1"]),
    };
    const out = await buildRealmPayloadFromServer("srv1");
    expect(out.gameSlug).toBe("MINECRAFT");
    expect(out.suggestedName).toBe("Dragonhold");
    expect(out.payload.modpack).toMatchObject({ kind: "curseforge", projectId: "907066", loaderType: "forge" });
    // The pack's pinned fileId must NOT freeze the realm on today's build.
    expect(out.payload.modpack!.fileId).toBeNull();
    // Pack-owned rows are summarized by the ref; only extras replay.
    expect(out.payload.mods).toHaveLength(1);
    expect(out.payload.mods[0]).toMatchObject({ packageId: "extra-mod", version: "3.4.1" });
    expect(out.payload.loader).toMatchObject({ type: "forge", loaderVersion: "21.1.100" });
  });

  it("refuses to publish a pack that has no provider id (local file import)", async () => {
    bag.server.modpack = { kind: "curseforge", projectId: null, packName: "Local Pack" };
    await expect(buildRealmPayloadFromServer("srv1")).rejects.toThrow(/can't be re-downloaded/);
  });

  it("pins standalone mods and reads the loader marker on packless servers", async () => {
    bag.marker = { type: "fabric", loaderVersion: "0.20.1", minecraftVersion: "1.21.1" };
    bag.server.mods = [
      { disabled: false, provider: "modrinth", packageId: "carpet", name: "Carpet", version: "1.21.1-1.4.169", workshopModId: null },
    ];
    const out = await buildRealmPayloadFromServer("srv1");
    expect(out.payload.loader).toMatchObject({ type: "fabric", loaderVersion: "0.20.1", minecraftVersion: "1.21.1" });
    expect(out.payload.mods[0].version).toBe("1.21.1-1.4.169");
  });

  it("drops disabled mods with a warning and 'latest' placeholders pin nothing", async () => {
    bag.server.mods = [
      { disabled: true, provider: "modrinth", packageId: "off-mod", name: "Off", version: "1.0", workshopModId: null },
      { disabled: false, provider: "modrinth", packageId: "live-mod", name: "Live", version: "latest", workshopModId: null },
    ];
    const out = await buildRealmPayloadFromServer("srv1");
    expect(out.payload.mods).toHaveLength(1);
    expect(out.payload.mods[0].packageId).toBe("live-mod");
    expect(out.payload.mods[0].version).toBeUndefined();
    expect(out.warnings.join(" ")).toMatch(/disabled mod/);
  });

  it("warns on MC mods without any loader — deploys will boot vanilla", async () => {
    bag.server.mods = [
      { disabled: false, provider: "modrinth", packageId: "carpet", name: "Carpet", version: "1.0", workshopModId: null },
    ];
    const out = await buildRealmPayloadFromServer("srv1");
    expect(out.payload.loader).toBeNull();
    expect(out.warnings.join(" ")).toMatch(/no mod loader/);
  });

  it("carries startup params as strings and keeps tModLoader realms replayable", async () => {
    bag.server.game = "TERRARIA";
    bag.server.paramValues = JSON.stringify({ world: " Planeta ", difficulty: 0, maxPlayers: 16 });
    bag.tml = { type: "tmodloader", tmlVersion: "2024.11" };
    bag.server.mods = [
      { disabled: false, provider: "workshop", packageId: "2824688507", name: "some tmod", version: "1.2.3", workshopModId: null },
    ];
    const out = await buildRealmPayloadFromServer("srv1");
    expect(out.payload.startupParams).toEqual({ world: " Planeta ", difficulty: "0", maxPlayers: "16" });
    expect(out.payload.loader).toMatchObject({ type: "tmodloader", loaderVersion: "2024.11" });
  });

  it("degrades gracefully when paramValues is garbage", async () => {
    bag.server.paramValues = "{not json";
    const out = await buildRealmPayloadFromServer("srv1");
    expect(out.payload.startupParams).toEqual({});
  });
});
