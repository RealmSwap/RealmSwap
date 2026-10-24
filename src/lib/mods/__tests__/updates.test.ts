import { describe, it, expect } from "vitest";
import { checkModUpdates } from "@/lib/mods/updates";

function modrinthVersion(version_number: string) {
  return {
    id: "v-" + version_number,
    version_number,
    game_versions: ["1.21.1"],
    loaders: ["fabric"],
    dependencies: [],
    files: [{ url: "https://example.com/x.jar", filename: "x.jar", primary: true }],
  } as any;
}

function thunderstorePkg(full_name: string, versions: string[]) {
  return {
    full_name,
    name: full_name.split("-")[1],
    owner: full_name.split("-")[0],
    versions: versions.map((v) => ({ version_number: v, download_url: "https://x/" + v, dependencies: [] })),
  } as any;
}

const rows = [
  { provider: "modrinth", packageId: "mod-a", version: "1.0.0", name: "Mod A" },
  { provider: "modrinth", packageId: "mod-b", version: "2.0.0", name: "Mod B" },
  { provider: "modrinth", packageId: "mod-u", version: "unknown", name: "Mod U" },
  { provider: "thunderstore", packageId: "owner-pkg", version: "1.4.0", name: "Pkg" },
  { provider: "steamworkshop", packageId: "123", version: "1", name: "WS Mod" },
];

const deps = {
  mcVersion: "1.21.1",
  loader: "fabric",
  fetchVersions: (async (id: string) =>
    id === "mod-a"
      ? [modrinthVersion("1.2.0"), modrinthVersion("1.0.0")]
      : [modrinthVersion("2.0.0")]) as any,
  fetchIndex: (async () => [
    thunderstorePkg("owner-pkg", ["1.4.2", "1.4.0"]),
    thunderstorePkg("owner-gone", ["2.0.0"]),
  ]) as any,
};

describe("checkModUpdates", () => {
  it("flags stale mods and reports unknown versions", async () => {
    const result = await checkModUpdates({
      game: "MINECRAFT",
      serverRoot: "/tmp/none",
      rows,
      deps,
    });

    expect(result.updates).toEqual([
      { packageId: "mod-a", name: "Mod A", provider: "modrinth", current: "1.0.0", latest: "1.2.0" },
    ]);
    expect(result.unknown).toEqual([{ packageId: "mod-u", name: "Mod U", version: "unknown" }]);
    // thunderstore rows on a Minecraft server have no community → error, not a crash
    expect(result.errors.some((e) => e.includes("no Thunderstore community"))).toBe(true);
    expect(result.errors.some((e) => e.includes("steamworkshop"))).toBe(true);
  });

  it("reports up-to-date mods as not stale", async () => {
    const result = await checkModUpdates({
      game: "MINECRAFT",
      serverRoot: "/tmp/none",
      rows: [{ provider: "modrinth", packageId: "mod-b", version: "2.0.0", name: "Mod B" }],
      deps,
    });
    expect(result.updates).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("compares thunderstore rows against the newest index version", async () => {
    const result = await checkModUpdates({
      game: "VALHEIM",
      serverRoot: "/tmp/none",
      rows: [
        { provider: "thunderstore", packageId: "owner-pkg", version: "1.4.0", name: "Pkg" },
        { provider: "thunderstore", packageId: "owner-missing", version: "1.0.0", name: "Missing" },
      ],
      deps,
    });
    expect(result.updates).toEqual([
      { packageId: "owner-pkg", name: "Pkg", provider: "thunderstore", current: "1.4.0", latest: "1.4.2" },
    ]);
    expect(result.errors.some((e) => e.includes("no longer available"))).toBe(true);
  });

  it("errors per-mod without failing the whole check", async () => {
    const failingDeps = {
      ...deps,
      fetchVersions: (async () => {
        throw new Error("network down");
      }) as any,
    };
    const result = await checkModUpdates({
      game: "MINECRAFT",
      serverRoot: "/tmp/none",
      rows: [{ provider: "modrinth", packageId: "mod-a", version: "1.0.0", name: "Mod A" }],
      deps: failingDeps,
    });
    expect(result.updates).toEqual([]);
    expect(result.errors[0]).toContain("network down");
  });
});

describe("workshop rows (Steam Workshop, Zomboid)", () => {
  const wsDeps = {
    fetchWorkshopDetails: (async (ids: string[]) => {
      const map = new Map();
      for (const id of ids) {
        if (id === "gone") continue;
        map.set(id, { workshopId: id, title: id, timeUpdated: id === "w-current" ? "2025-06-01T00:00:00.000Z" : "2025-12-01T00:00:00.000Z" });
      }
      return map;
    }) as any,
  };

  it("flags stale versions, passes up-to-date, and buckets non-date versions as unknown", async () => {
    const result = await checkModUpdates({
      game: "ZOMBOID",
      serverRoot: "/tmp/none",
      rows: [
        { provider: "workshop", packageId: "w-stale", version: "2025-01-01T00:00:00.000Z", name: "Stale" },
        { provider: "workshop", packageId: "w-current", version: "2025-06-01T00:00:00.000Z", name: "Current" },
        { provider: "workshop", packageId: "w-legacy", version: "Workshop", name: "Legacy" },
      ],
      deps: wsDeps,
    });

    expect(result.updates).toEqual([
      { packageId: "w-stale", name: "Stale", provider: "workshop", current: "2025-01-01T00:00:00.000Z", latest: "2025-12-01T00:00:00.000Z" },
    ]);
    expect(result.unknown).toEqual([{ packageId: "w-legacy", name: "Legacy", version: "Workshop" }]);
    expect(result.errors).toEqual([]);
  });

  it("reports items that vanished from the workshop", async () => {
    const result = await checkModUpdates({
      game: "ZOMBOID",
      serverRoot: "/tmp/none",
      rows: [{ provider: "workshop", packageId: "gone", version: "2025-01-01T00:00:00.000Z", name: "Gone Mod" }],
      deps: wsDeps,
    });
    expect(result.updates).toEqual([]);
    expect(result.errors[0]).toContain("no longer available");
  });

  it("still errors for workshop rows on other games (no install strategy there)", async () => {
    const result = await checkModUpdates({
      game: "MINECRAFT",
      serverRoot: "/tmp/none",
      rows: [{ provider: "workshop", packageId: "w1", version: "2025-01-01T00:00:00.000Z", name: "WS" }],
      deps: wsDeps,
    });
    expect(result.errors[0]).toContain('provider "workshop"');
  });
});

describe("checkModUpdates: curseforge rows", () => {
  function cfApiFile(opts: { id: number; displayName: string }) {
    return {
      id: opts.id,
      modId: 42,
      displayName: opts.displayName,
      fileName: "x.jar",
      downloadUrl: null,
      hashes: [],
      gameVersions: ["1.21.1", "Fabric"],
      modLoaderType: 4,
      dependencies: [],
      isAvailable: true,
    };
  }

  const cfDeps = (files: any[]) => ({
    mcVersion: "1.21.1",
    loader: "fabric",
    getCfModFiles: (async () => files) as any,
  });

  it("flags stale curseforge mods and reports unknown versions", async () => {
    const result = await checkModUpdates({
      game: "MINECRAFT",
      serverRoot: "/tmp/none",
      rows: [
        { provider: "curseforge", packageId: "42", version: "1.0.0", name: "CF Mod" },
        { provider: "curseforge", packageId: "42", version: "unknown", name: "CF Unknown" },
        { provider: "curseforge", packageId: "not-a-number", version: "1.0.0", name: "CF Bad" },
      ],
      deps: cfDeps([cfApiFile({ id: 900, displayName: "1.0.0" }), cfApiFile({ id: 1100, displayName: "2.0.0" })]),
    });
    expect(result.updates).toEqual([
      { packageId: "42", name: "CF Mod", provider: "curseforge", current: "1.0.0", latest: "2.0.0" },
    ]);
    expect(result.unknown).toEqual([{ packageId: "42", name: "CF Unknown", version: "unknown" }]);
    expect(result.errors[0]).toContain("not a CurseForge mod id");
  });

  it("reports files locked to CurseForge distribution and version-matched rows as current", async () => {
    const result = await checkModUpdates({
      game: "MINECRAFT",
      serverRoot: "/tmp/none",
      rows: [{ provider: "curseforge", packageId: "42", version: "2.0.0", name: "CF Mod" }],
      deps: cfDeps([cfApiFile({ id: 1100, displayName: "2.0.0" })]),
    });
    expect(result.updates).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("rejects curseforge updates on non-Minecraft games", async () => {
    const result = await checkModUpdates({
      game: "VALHEIM",
      serverRoot: "/tmp/none",
      rows: [{ provider: "curseforge", packageId: "42", version: "1.0.0", name: "CF Mod" }],
      deps: cfDeps([]),
    });
    expect(result.updates).toEqual([]);
    expect(result.errors[0]).toContain("Minecraft servers only");

  });
});

describe("ARK workshop rows", () => {
  it("are deliberately unreported — the server auto-updates them on start", async () => {
    const result = await checkModUpdates({
      game: "ARK",
      serverRoot: "/tmp/none",
      rows: [{ provider: "workshop", packageId: "731604991", version: "2020-01-01T00:00:00.000Z", name: "S+" }],
      deps: {
        fetchWorkshopDetails: (async () => {
          throw new Error("must not be called for ARK");
        }) as any,
      },
    });
    expect(result.updates).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.unknown).toEqual([]);
  });
});
