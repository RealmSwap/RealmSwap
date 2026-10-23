import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import fs from "fs";
import os from "os";
import path from "path";
import {
  parseDependencyString,
  matchesSpec,
  pickVersionForSpec,
  findVersionEntry,
  isBepInExCore,
  collectDependencies,
  extractThunderstorePackage,
  ThunderstorePackage,
} from "../thunderstore";

describe("parseDependencyString", () => {
  it("splits owner-package-version at the version segment", () => {
    expect(parseDependencyString("owner-mod-1.2.3")).toEqual({
      packageId: "owner-mod",
      versionSpec: "1.2.3",
    });
  });

  it("keeps major-only specs", () => {
    expect(parseDependencyString("owner-mod-2")?.versionSpec).toBe("2");
  });

  it("keeps dashed package names intact", () => {
    expect(parseDependencyString("some-team-cool-mod-1.0.0")?.packageId).toBe("some-team-cool-mod");
  });

  it("keeps prerelease versions on the spec side", () => {
    expect(parseDependencyString("owner-mod-1.0.0-beta.1")).toEqual({
      packageId: "owner-mod",
      versionSpec: "1.0.0-beta.1",
    });
  });

  it("does not split a trailing-digit package name without a version", () => {
    expect(parseDependencyString("owner-mod2")).toBeNull();
    // "owner-mod2-1.0.0" must split before the version, not before the name's digit
    expect(parseDependencyString("owner-mod2-1.0.0")?.packageId).toBe("owner-mod2");
  });
});

describe("matchesSpec", () => {
  it("matches exact versions and prefix specs on segment boundaries", () => {
    expect(matchesSpec("1.2.3", "1.2.3")).toBe(true);
    expect(matchesSpec("1.2.7", "1.2")).toBe(true);
    expect(matchesSpec("1.9.9", "1")).toBe(true);
  });

  it("rejects partial-segment and wrong-version matches", () => {
    expect(matchesSpec("1.40.0", "1.4")).toBe(false);
    expect(matchesSpec("1.9.9", "2")).toBe(false);
  });

  it("matches exact prerelease specs", () => {
    expect(matchesSpec("1.0.0-beta.1", "1.0.0-beta.1")).toBe(true);
    expect(matchesSpec("1.0.0-beta.1", "1.0.0-beta.2")).toBe(false);
  });
});

const pkg = (full_name: string, versions: { version_number: string; dependencies?: string[] }[]): ThunderstorePackage => ({
  full_name,
  name: full_name.split("-").slice(1).join("-") || full_name,
  owner: full_name.split("-")[0],
  is_deprecated: false,
  rating_score: 1,
  date_updated: "2026-01-01T00:00:00Z",
  categories: [],
  versions: versions.map((v) => ({
    version_number: v.version_number,
    download_url: `https://thunderstore.io/${full_name}/${v.version_number}.zip`,
    dependencies: v.dependencies ?? [],
    description: "",
    icon: "",
  })),
});

describe("pickVersionForSpec / findVersionEntry", () => {
  const p = pkg("owner-mod", [
    { version_number: "1.4.2" },
    { version_number: "1.4.0" },
    { version_number: "1.3.9" },
  ]);

  it("returns the newest version satisfying the spec (API order)", () => {
    expect(pickVersionForSpec(p, "1.4")?.version_number).toBe("1.4.2");
    expect(pickVersionForSpec(p, "1")?.version_number).toBe("1.4.2");
    expect(pickVersionForSpec(p, "1.5")).toBeNull();
  });

  it("finds version entries by number or download URL", () => {
    expect(findVersionEntry(p, { versionNumber: "1.4.0" })?.version_number).toBe("1.4.0");
    expect(findVersionEntry(p, { downloadUrl: p.versions[1].download_url })?.version_number).toBe("1.4.0");
    expect(findVersionEntry(p, { versionNumber: "9.9.9", downloadUrl: "https://nope" })).toBeNull();
  });
});

describe("collectDependencies", () => {
  it("walks required deps breadth-first, dependency-first order", () => {
    const index = [
      pkg("me-Root", [{ version_number: "1.0.0", dependencies: ["some-Lib-1.0.0"] }]),
      pkg("some-Lib", [{ version_number: "1.0.0", dependencies: ["other-Deep-2.1.0"] }]),
      pkg("other-Deep", [{ version_number: "2.1.0" }]),
    ];
    const lookup = (id: string) => index.find((p) => p.full_name === id) ?? null;
    const { order, missing } = collectDependencies(
      { packageId: "me-Root", version: index[0].versions[0] },
      lookup,
      () => false
    );
    expect(order.map((d) => d.packageId)).toEqual(["some-Lib", "other-Deep"]);
    expect(missing).toEqual([]);
    // Real download URLs and versions, not fakes
    expect(order[0]).toMatchObject({ version: "1.0.0", downloadUrl: expect.stringContaining("some-Lib") });
  });

  it("skips the BepInEx core pack, already-installed packages, and cycles", () => {
    const index = [
      pkg("me-Root", [{ version_number: "1.0.0", dependencies: [
        "denikson-BepInExPack_Valheim-5.4.2202",
        "some-Lib-1.0.0",
        "me-Root-1.0.0",
        "other-Deep-2.1.0",
      ] }]),
      pkg("some-Lib", [{ version_number: "1.0.0" }]),
      pkg("other-Deep", [{ version_number: "2.1.0" }]),
    ];
    const lookup = (id: string) => index.find((p) => p.full_name === id) ?? null;
    const { order, missing } = collectDependencies(
      { packageId: "me-Root", version: index[0].versions[0] },
      lookup,
      (id) => id === "other-Deep"
    );
    expect(order.map((d) => d.packageId)).toEqual(["some-Lib"]);
    expect(missing).toEqual([]);
  });

  it("reports unresolvable deps and unsatisfiable version pins instead of silently dropping them", () => {
    const index = [
      pkg("me-Root", [{ version_number: "1.0.0", dependencies: [
        "ghost-Pkg-1.0.0",
        "not-this-version",
        "some-Lib-2.0.0",
      ] }]),
      pkg("some-Lib", [{ version_number: "1.0.0" }]), // no 2.x available
    ];
    const lookup = (id: string) => index.find((p) => p.full_name === id) ?? null;
    const { order, missing } = collectDependencies(
      { packageId: "me-Root", version: index[0].versions[0] },
      lookup,
      () => false
    );
    expect(order).toEqual([]);
    expect(missing).toEqual(["ghost-Pkg-1.0.0", "not-this-version", "some-Lib-2.0.0"]);
  });

  it("caps the walk depth", () => {
    const index: ThunderstorePackage[] = [];
    for (let i = 0; i < 20; i++) {
      index.push(pkg(`chain-Link${i}`, [{ version_number: "1.0.0", dependencies: [`chain-Link${i + 1}-1.0.0`] }]));
    }
    const lookup = (id: string) => index.find((p) => p.full_name === id) ?? null;
    const { order } = collectDependencies(
      { packageId: "chain-Link0", version: index[0].versions[0] },
      lookup,
      () => false
    );
    expect(order.length).toBe(12);
  });

  it("treats BepInExPack ids as core", () => {
    expect(isBepInExCore("denikson-BepInExPack_Valheim")).toBe(true);
    expect(isBepInExCore("me-Root")).toBe(false);
  });
});

describe("extractThunderstorePackage", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-tsm-"));

  it("extracts every entry under the package folder", () => {
    const zip = new AdmZip();
    zip.addFile("plugins/mod.dll", Buffer.from("dll"));
    zip.addFile("manifest.json", Buffer.from("{}"));
    zip.addFile("sub/dir/deep.cfg", Buffer.from("cfg"));
    const count = extractThunderstorePackage(zip, path.join(dir, "owner-mod"));
    expect(count).toBe(3);
    expect(fs.readFileSync(path.join(dir, "owner-mod", "plugins", "mod.dll"), "utf-8")).toBe("dll");
    expect(fs.existsSync(path.join(dir, "owner-mod", "manifest.json"))).toBe(true);
  });

  it("blocks zip-slip attempts in package entries", () => {
    // adm-zip's writer sanitizes "..", so a hostile entry is stubbed the way
    // a hand-crafted archive would present it: raw traversal name on read.
    const hostileZip = {
      getEntries: () => [
        { entryName: "../../escaped.dll", isDirectory: false, getData: () => Buffer.from("evil") },
      ],
    } as unknown as AdmZip;
    expect(() => extractThunderstorePackage(hostileZip, path.join(dir, "victim"))).toThrow(/unsafe/i);
    expect(fs.existsSync(path.resolve(dir, "escaped.dll"))).toBe(false);
  });
});
