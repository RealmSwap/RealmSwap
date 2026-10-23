import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import {
  detectModLoader, detectMinecraftVersion, readLoaderMarker, writeLoaderMarker,
} from "../mcLoaders";
import {
  pickCompatibleVersion, primaryFile, collectRequiredDependencies,
  type ModrinthVersion,
} from "../modrinth";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mods-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeJar(name: string, entries: Record<string, string>): string {
  const zip = new AdmZip();
  for (const [entry, content] of Object.entries(entries)) zip.addFile(entry, Buffer.from(content, "utf-8"));
  const p = path.join(dir, name);
  zip.writeZip(p);
  return p;
}

describe("mcLoaders", () => {
  it("detects Fabric, Quilt, and Forge jars by manifest", () => {
    expect(detectModLoader(makeJar("fabric.jar", { "fabric.mod.json": "{}" }))).toBe("fabric");
    expect(detectModLoader(makeJar("quilt.jar", { "quilt.mod.json": "{}" }))).toBe("quilt");
    expect(detectModLoader(makeJar("forge.jar", { "META-INF/mods.toml": 'loader="javafml"' }))).toBe("forge");
  });

  it("returns null for loader-less jars", () => {
    expect(detectModLoader(makeJar("plain.jar", { "META-INF/MANIFEST.MF": "Manifest-Version: 1.0" }))).toBeNull();
  });

  it("reads the Minecraft version from server.jar's version.json", () => {
    makeJar("server.jar", { "version.json": JSON.stringify({ id: "1.20.4", name: "1.20.4" }) });
    expect(detectMinecraftVersion(dir)).toBe("1.20.4");
  });

  it("round-trips the loader marker", () => {
    expect(readLoaderMarker(dir)).toBeNull();
    writeLoaderMarker(dir, { type: "fabric", loaderVersion: "0.16.0", minecraftVersion: "1.20.4", installedAt: "now" });
    expect(readLoaderMarker(dir)).toMatchObject({ type: "fabric", loaderVersion: "0.16.0" });
  });
});

function version(partial: Partial<ModrinthVersion> & { id: string; project_id: string }): ModrinthVersion {
  return {
    version_number: "1.0.0",
    game_versions: [],
    loaders: [],
    dependencies: [],
    files: [{ url: `https://example.com/${partial.id}.jar`, filename: `${partial.id}.jar`, primary: true }],
    ...partial,
  } as ModrinthVersion;
}

describe("modrinth helpers", () => {
  it("picks the first version matching game version and loader", () => {
    const versions = [
      version({ id: "v3", project_id: "p", version_number: "3.0.0", game_versions: ["1.21"], loaders: ["fabric"] }),
      version({ id: "v2", project_id: "p", version_number: "2.0.0", game_versions: ["1.20.4"], loaders: ["fabric"] }),
      version({ id: "v1", project_id: "p", version_number: "1.0.0", game_versions: ["1.20.4"], loaders: ["forge"] }),
    ];
    expect(pickCompatibleVersion(versions, { gameVersion: "1.20.4", loader: "fabric" })?.version_number).toBe("2.0.0");
    expect(pickCompatibleVersion(versions, {})?.version_number).toBe("3.0.0"); // no constraints → newest
    expect(pickCompatibleVersion(versions, { loader: "quilt" })).toBeNull();
  });

  it("prefers the primary file", () => {
    const v = version({ id: "v", project_id: "p", files: [
      { url: "secondary", filename: "a.jar", primary: false },
      { url: "primary", filename: "b.jar", primary: true },
    ]});
    expect(primaryFile(v)?.url).toBe("primary");
  });

  it("walks required dependencies breadth-first, skipping optional, installed, and cyclic", () => {
    const root = version({ id: "root", project_id: "root", dependencies: [
      { project_id: "liba", dependency_type: "required" },
      { project_id: "libb", dependency_type: "optional" },        // skipped
      { project_id: "installed", dependency_type: "required" },   // already installed
    ]});
    const liba = version({ id: "va", project_id: "liba", dependencies: [
      { project_id: "deep", dependency_type: "required" },
      { project_id: "root", dependency_type: "required" },        // cycle
    ]});
    const deep = version({ id: "vd", project_id: "deep" });

    const lookup = (id: string) => ({ root, liba, deep, installed: version({ id: "vi", project_id: "installed" }) })[id] ?? null;
    const { order, missingProjects } = collectRequiredDependencies(root, lookup, (id) => id === "installed");

    expect(order.map((v) => v.project_id)).toEqual(["liba", "deep"]); // deps before deeper deps
    expect(missingProjects).toEqual([]);
  });

  it("records unresolvable dependencies instead of failing", () => {
    const root = version({ id: "r", project_id: "r", dependencies: [{ project_id: "ghost", dependency_type: "required" }] });
    const { order, missingProjects } = collectRequiredDependencies(root, () => null, () => false);
    expect(order).toEqual([]);
    expect(missingProjects).toEqual(["ghost"]);
  });
});
