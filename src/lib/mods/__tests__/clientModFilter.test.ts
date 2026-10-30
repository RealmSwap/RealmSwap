import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { planClientExclusions, scanJarClientSignals, type ExclusionCandidate } from "../clientModFilter";
import { dupEntryZip } from "./zipFixtures";

function makeJar(name: string, opts: { modId?: string; requiredDeps?: string[]; optionalDeps?: string[]; earlyWindowService?: boolean; fabricManifest?: boolean; fmlLibrary?: boolean; jarJarWrapper?: boolean }): string {
  const zip = new AdmZip();
  if (opts.modId) {
    let toml = `modLoader="javafml"\nloaderVersion="[1,)"\nlicense="MIT"\n[[mods]]\nmodId="${opts.modId}"\nversion="1.0"\n`;
    for (const dep of opts.requiredDeps ?? []) {
      toml += `\n[[dependencies.${opts.modId}]]\nmodId="${dep}"\ntype="required"\nversionRange="[1,)"\n`;
    }
    for (const dep of opts.optionalDeps ?? []) {
      toml += `\n[[dependencies.${opts.modId}]]\nmodId="${dep}"\ntype="optional"\nversionRange="[1,)"\n`;
    }
    zip.addFile("META-INF/neoforge.mods.toml", Buffer.from(toml));
  }
  if (opts.fabricManifest) {
    zip.addFile("fabric.mod.json", Buffer.from('{"id":"fab","version":"1.0"}'));
  }
  if (opts.earlyWindowService) {
    zip.addFile(
      "META-INF/services/net.neoforged.neoforgespi.earlywindow.GraphicsBootstrapper",
      Buffer.from("com.example.SodiumWorkarounds\n")
    );
  }
  if (opts.fmlLibrary) {
    zip.addFile("META-INF/MANIFEST.MF", Buffer.from("Manifest-Version: 1.0\nFMLModType: LIBRARY\n"));
  }
  if (opts.jarJarWrapper) {
    zip.addFile("META-INF/jarjar/metadata.json", Buffer.from('{"jars":[]}'));
  }
  zip.addFile("dummy.txt", Buffer.from("hello"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
  const p = path.join(dir, name);
  zip.writeZip(p);
  return p;
}

describe("scanJarClientSignals", () => {
  it("reads self mod id, required deps and the early-window service", () => {
    const p = makeJar("sodium.jar", {
      modId: "sodium",
      requiredDeps: ["fmlcore"],
      optionalDeps: ["iris"],
      earlyWindowService: true,
    });
    const sig = scanJarClientSignals(p);
    expect(sig.selfModId).toBe("sodium");
    expect(sig.hasEarlyWindowService).toBe(true);
    expect(sig.requiredDeps.has("fmlcore")).toBe(true);
    expect(sig.requiredDeps.has("iris")).toBe(false);
    expect(sig.loaders.has("neoforge")).toBe(true);
    expect(sig.fmlLibrary).toBe(false);
  });

  it("treats a jar without toml or services as inert", () => {
    const p = makeJar("plain.jar", {});
    const sig = scanJarClientSignals(p);
    expect(sig.selfModId).toBeNull();
    expect(sig.hasEarlyWindowService).toBe(false);
    expect(sig.requiredDeps.size).toBe(0);
    expect(sig.hasModManifest).toBe(false);
    expect(sig.loaders.size).toBe(0);
    expect(sig.fmlLibrary).toBe(false);
    expect(sig.jarJarWrapper).toBe(false);
  });

  it("sees a fabric.mod.json as a mod manifest and reads its id and side", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const p = path.join(dir, "fabric.jar");
    const zip = new AdmZip();
    zip.addFile("fabric.mod.json", Buffer.from('{"id":"fabricmod","version":"1.0"}'));
    zip.addFile("dummy.txt", Buffer.from("x"));
    zip.writeZip(p);
    const sig = scanJarClientSignals(p);
    expect(sig.hasModManifest).toBe(true);
    expect(sig.loaders.has("fabric")).toBe(true);
    // The manifest id feeds the blame index — fabric jars have no toml, and
    // without this they are invisible to boot-output blame.
    expect(sig.selfModId).toBe("fabricmod");
    expect(sig.sides).toBe("both"); // absent environment defaults to both sides
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads the manifest side declaration: fabric environment and forge clientSideOnly", () => {
    const mk = (name: string, manifest: { file: string; content: string }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
      const p = path.join(dir, name);
      const zip = new AdmZip();
      zip.addFile(manifest.file, Buffer.from(manifest.content));
      zip.addFile("dummy.txt", Buffer.from("x"));
      zip.writeZip(p);
      return p;
    };
    const bothFabric = mk("both.jar", { file: "fabric.mod.json", content: '{"id":"a","environment":"*"}' });
    const clientFabric = mk("client.jar", { file: "fabric.mod.json", content: '{"id":"b","environment":"client"}' });
    const clientForge = mk("forgeclient.jar", {
      file: "META-INF/neoforge.mods.toml",
      content: '[[mods]]\nmodId="c"\nclientSideOnly=true\n',
    });
    // Hybrid: fabric side is both, forge side has no client declaration — the
    // jar is usable on the fabric side, so it must count as both.
    const hybridDir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const hybrid = path.join(hybridDir, "hybrid.jar");
    const hz = new AdmZip();
    hz.addFile("fabric.mod.json", Buffer.from('{"id":"d","environment":"*"}'));
    hz.addFile("META-INF/neoforge.mods.toml", Buffer.from('[[mods]]\nmodId="d"\n'));
    hz.writeZip(hybrid);
    try {
      expect(scanJarClientSignals(bothFabric).sides).toBe("both");
      expect(scanJarClientSignals(clientFabric).sides).toBe("client");
      expect(scanJarClientSignals(clientForge).sides).toBe("client");
      expect(scanJarClientSignals(hybrid).sides).toBe("both");
    } finally {
      for (const p of [bothFabric, clientFabric, clientForge]) {
        fs.rmSync(path.dirname(p), { recursive: true, force: true });
      }
      fs.rmSync(hybridDir, { recursive: true, force: true });
    }
  });

  it("derives selfModId from [[mods]] blocks only — never from a dependency block", () => {
    // Live poison (Homestead 2.0.1): a toml that declares dependencies before
    // its [[mods]] block parsed modId="minecraft", and once "minecraft" was in
    // the excluded set the closure swept every jar requiring minecraft.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const p = path.join(dir, "deps-first.jar");
    const zip = new AdmZip();
    zip.addFile(
      "META-INF/neoforge.mods.toml",
      Buffer.from('[[dependencies.towns]]\nmodId="minecraft"\ntype="required"\n[[dependencies.towns]]\nmodId="terralith"\ntype="optional"\n[[mods]]\nmodId="towns"\n')
    );
    zip.addFile("dummy.txt", Buffer.from("x"));
    zip.writeZip(p);
    const sig = scanJarClientSignals(p);
    expect(sig.selfModId).toBe("towns");
    expect(sig.allModIds).toEqual(["towns"]);
    expect(sig.requiredDeps.has("minecraft")).toBe(true);
    expect(sig.requiredDeps.has("terralith")).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("recognizes FML LIBRARY jars and jarjar wrappers as manifest-less but healthy", () => {
    const lib = makeJar("scala.jar", { fmlLibrary: true });
    const wrapper = makeJar("kff.jar", { jarJarWrapper: true });
    const libSig = scanJarClientSignals(lib);
    const wrapperSig = scanJarClientSignals(wrapper);
    expect(libSig.fmlLibrary).toBe(true);
    expect(libSig.hasModManifest).toBe(false);
    expect(wrapperSig.jarJarWrapper).toBe(true);
    expect(wrapperSig.hasModManifest).toBe(false);
    fs.rmSync(path.dirname(lib), { recursive: true, force: true });
    fs.rmSync(path.dirname(wrapper), { recursive: true, force: true });
  });

  it("returns inert signals for a jar with duplicated entry names instead of throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const p = path.join(dir, "duplicated.jar");
    fs.writeFileSync(
      p,
      dupEntryZip([
        { name: "META-INF/MANIFEST.MF", data: "Manifest-Version: 1.0\n" },
        { name: "META-INF/LICENSE.TXT", data: "first copy" },
        { name: "META-INF/LICENSE.TXT", data: "second copy" },
        { name: "META-INF/neoforge.mods.toml", data: '[[mods]]\nmodId="shaded"\n' },
      ])
    );
    const sig = scanJarClientSignals(p);
    expect(sig).toEqual({
      selfModId: null,
      allModIds: [],
      hasEarlyWindowService: false,
      hasModManifest: false,
      sides: "unknown",
      unreadableZip: true,
      loaders: new Set(),
      fmlLibrary: false,
      jarJarWrapper: false,
      requiredDeps: new Set(),
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("planClientExclusions", () => {
  let sodium = "";
  let sodiumExtra = "";
  let create = "";
  let plain = "";

  beforeAll(() => {
    sodium = makeJar("sodium.jar", { modId: "sodium", earlyWindowService: true, optionalDeps: [] });
    sodiumExtra = makeJar("sodium-extra.jar", { modId: "sodiumextra", requiredDeps: ["sodium"] });
    // Create lists sodium as OPTIONAL in real packs — must NOT be excluded.
    create = makeJar("create.jar", { modId: "create", optionalDeps: ["sodium"] });
    plain = makeJar("plain.jar", { modId: "plainmod" });
  });

  afterAll(() => {
    for (const p of [sodium, sodiumExtra, create, plain]) {
      fs.rmSync(path.dirname(p), { recursive: true, force: true });
    }
  });

  function candidate(p: string): ExclusionCandidate {
    return { file: p, signals: scanJarClientSignals(p) };
  }

  it("excludes the early-window seed and its required dependents, nothing else", () => {
    const candidates = [sodium, sodiumExtra, create, plain].map(candidate);
    const { excluded, reasons } = planClientExclusions(candidates);
    const files = excluded.map((c) => c.file);
    expect(files).toEqual([sodium, sodiumExtra]);
    expect(reasons.get(sodium)).toMatch(/client display service/);
    expect(reasons.get(sodiumExtra)).toMatch(/requires sodium/);
  });

  it("leaves everything in when no jar is risky", () => {
    const { excluded } = planClientExclusions([create, plain].map(candidate));
    expect(excluded).toEqual([]);
  });

  it("supports a forced seed (crash-report blame) on a jar without services", () => {
    const darkmode = makeJar("darkmode.jar", { modId: "darkmodeeverywhere" });
    try {
      const { excluded } = planClientExclusions([darkmode, create].map(candidate), new Set([darkmode]));
      expect(excluded.map((c) => c.file)).toEqual([darkmode]);
    } finally {
      fs.rmSync(path.dirname(darkmode), { recursive: true, force: true });
    }
  });

  it("excludes manifest-less jars (shader/resource packs) but spares unreadable zips", () => {
    const shader = makeJar("322506.jar", {}); // valid zip, no mod manifest
    const unreadable = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-")), "dup.jar");
    fs.writeFileSync(
      unreadable,
      dupEntryZip([
        { name: "META-INF/LICENSE.TXT", data: "first copy" },
        { name: "META-INF/LICENSE.TXT", data: "second copy" },
      ])
    );
    try {
      const { excluded, reasons } = planClientExclusions([shader, unreadable, create].map(candidate));
      expect(excluded.map((c) => c.file)).toEqual([shader]);
      expect(reasons.get(shader)).toMatch(/no Fabric\/NeoForge mod manifest/);
    } finally {
      fs.rmSync(path.dirname(shader), { recursive: true, force: true });
      fs.rmSync(path.dirname(unreadable), { recursive: true, force: true });
    }
  });

  it("spares FML LIBRARY jars and jarjar wrappers from the no-manifest sweep", () => {
    const lib = makeJar("scala-provider.jar", { fmlLibrary: true });
    const wrapper = makeJar("kff.jar", { jarJarWrapper: true });
    try {
      const { excluded } = planClientExclusions([lib, wrapper, create].map(candidate));
      expect(excluded).toEqual([]);
    } finally {
      fs.rmSync(path.dirname(lib), { recursive: true, force: true });
      fs.rmSync(path.dirname(wrapper), { recursive: true, force: true });
    }
  });

  it("excludes cross-loader jars when the server's loader is known, keeps matching ones", () => {
    const fabricOnly = makeJar("500525.jar", { fabricManifest: true });
    const neoforge = makeJar("waystones.jar", { modId: "waystones" });
    try {
      const { excluded, reasons } = planClientExclusions([fabricOnly, neoforge].map(candidate), undefined, {
        targetLoader: "neoforge",
      });
      expect(excluded.map((c) => c.file)).toEqual([fabricOnly]);
      expect(reasons.get(fabricOnly)).toMatch(/can't load on a neoforge server/);
    } finally {
      fs.rmSync(path.dirname(fabricOnly), { recursive: true, force: true });
      fs.rmSync(path.dirname(neoforge), { recursive: true, force: true });
    }
  });

  it("without a known target loader, cross-loader jars are left for the boot test", () => {
    const fabricOnly = makeJar("500525.jar", { fabricManifest: true });
    try {
      const { excluded } = planClientExclusions([fabricOnly].map(candidate));
      expect(excluded).toEqual([]);
    } finally {
      fs.rmSync(path.dirname(fabricOnly), { recursive: true, force: true });
    }
  });

  it("labels a forced cross-loader seed by its loader, not 'client-only'", () => {
    const fabricOnly = makeJar("272515.jar", { fabricManifest: true });
    try {
      const { reasons } = planClientExclusions([fabricOnly, create].map(candidate), new Set([fabricOnly]), {
        targetLoader: "neoforge",
      });
      expect(reasons.get(fabricOnly)).toMatch(/built for fabric/);
    } finally {
      fs.rmSync(path.dirname(fabricOnly), { recursive: true, force: true });
    }
  });

  it("labels a forced manifest-less seed as FML-rejected, not client-only", () => {
    const shader = makeJar("385587.jar", {});
    try {
      const { reasons } = planClientExclusions([shader, create].map(candidate), new Set([shader]));
      expect(reasons.get(shader)).toMatch(/isn't a valid mod file/);
    } finally {
      fs.rmSync(path.dirname(shader), { recursive: true, force: true });
    }
  });

  it("excludes manifest-declared client-only jars, but never both-sides mods", () => {
    const clientModDir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const clientMod = path.join(clientModDir, "ambientsounds.jar");
    const cz = new AdmZip();
    cz.addFile("fabric.mod.json", Buffer.from('{"id":"ambientsounds","environment":"client"}'));
    cz.addFile("dummy.txt", Buffer.from("x"));
    cz.writeZip(clientMod);
    // Friends For Life class: fabric environment "*" — it runs on the server
    // and its channel is required at client handshake. Sweeping it kicked
    // every joining client (live: Homestead 2.0.1, 2026-10-30).
    const bothDir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const bothMod = path.join(bothDir, "friendsforlife.jar");
    const fz = new AdmZip();
    fz.addFile("fabric.mod.json", Buffer.from('{"id":"friendsforlife","environment":"*"}'));
    fz.addFile("dummy.txt", Buffer.from("x"));
    fz.writeZip(bothMod);
    try {
      const { excluded, reasons } = planClientExclusions([clientMod, bothMod, create].map(candidate));
      expect(excluded.map((c) => c.file)).toEqual([clientMod]);
      expect(reasons.get(clientMod)).toMatch(/declares itself client-only/);
    } finally {
      fs.rmSync(clientModDir, { recursive: true, force: true });
      fs.rmSync(bothDir, { recursive: true, force: true });
    }
  });

  it("the closure never sweeps jars over vanilla ids like minecraft (deps-first toml poison)", () => {
    // A seed whose toml declares dependencies BEFORE [[mods]] once parsed
    // modId="minecraft" into the excluded set — every jar requiring
    // minecraft then got swept as "requires minecraft (excluded as
    // client-only)". Live: the Homestead install lost ~25 server-safe mods.
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const seed = path.join(seedDir, "crashed.jar");
    const sz = new AdmZip();
    sz.addFile(
      "META-INF/neoforge.mods.toml",
      Buffer.from('[[dependencies.towns]]\nmodId="minecraft"\ntype="required"\n[[mods]]\nmodId="towns"\n')
    );
    sz.addFile("dummy.txt", Buffer.from("x"));
    sz.writeZip(seed);
    const requirerDir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const requirer = path.join(requirerDir, "serilum.jar");
    const rz = new AdmZip();
    rz.addFile(
      "META-INF/neoforge.mods.toml",
      Buffer.from('[[mods]]\nmodId="stackrefill"\n[[dependencies.stackrefill]]\nmodId="minecraft"\ntype="required"\n[[dependencies.stackrefill]]\nmodId="collective"\ntype="required"\n')
    );
    rz.addFile("dummy.txt", Buffer.from("x"));
    rz.writeZip(requirer);
    try {
      // Seed is forced (a real boot-crash blame) — but its modId is "towns",
      // and "minecraft" must never enter the excluded set.
      const { excluded, reasons } = planClientExclusions([seed, requirer, create].map(candidate), new Set([seed]));
      expect(excluded.map((c) => c.file)).toEqual([seed]);
      expect(reasons.get(seed)).toMatch(/crashed the boot test/);
    } finally {
      fs.rmSync(seedDir, { recursive: true, force: true });
      fs.rmSync(requirerDir, { recursive: true, force: true });
    }
  });

  it("the closure still pulls true required dependents of an excluded mod", () => {
    // collective is a real mod — a legit boot-crash blame on it must still
    // sweep the Serilum mods that hard-require it.
    const collectiveDir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const collective = path.join(collectiveDir, "collective.jar");
    const cz = new AdmZip();
    cz.addFile(
      "META-INF/neoforge.mods.toml",
      Buffer.from('[[mods]]\nmodId="collective"\n[[dependencies.collective]]\nmodId="minecraft"\ntype="required"\n')
    );
    cz.addFile("dummy.txt", Buffer.from("x"));
    cz.writeZip(collective);
    const requirerDir = fs.mkdtempSync(path.join(os.tmpdir(), "clientmod-"));
    const requirer = path.join(requirerDir, "stackrefill.jar");
    const rz = new AdmZip();
    rz.addFile(
      "META-INF/neoforge.mods.toml",
      Buffer.from('[[mods]]\nmodId="stackrefill"\n[[dependencies.stackrefill]]\nmodId="collective"\ntype="required"\n')
    );
    rz.addFile("dummy.txt", Buffer.from("x"));
    rz.writeZip(requirer);
    try {
      const { excluded, reasons } = planClientExclusions([collective, requirer, create].map(candidate), new Set([collective]));
      expect(excluded.map((c) => c.file)).toEqual([collective, requirer]);
      expect(reasons.get(requirer)).toMatch(/requires collective/);
    } finally {
      fs.rmSync(collectiveDir, { recursive: true, force: true });
      fs.rmSync(requirerDir, { recursive: true, force: true });
    }
  });
});
