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
