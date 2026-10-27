import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { planClientExclusions, scanJarClientSignals, type ExclusionCandidate } from "../clientModFilter";

function makeJar(name: string, opts: { modId?: string; requiredDeps?: string[]; optionalDeps?: string[]; earlyWindowService?: boolean }): string {
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
  if (opts.earlyWindowService) {
    zip.addFile(
      "META-INF/services/net.neoforged.neoforgespi.earlywindow.GraphicsBootstrapper",
      Buffer.from("com.example.SodiumWorkarounds\n")
    );
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
  });

  it("treats a jar without toml or services as inert", () => {
    const p = makeJar("plain.jar", {});
    const sig = scanJarClientSignals(p);
    expect(sig.selfModId).toBeNull();
    expect(sig.hasEarlyWindowService).toBe(false);
    expect(sig.requiredDeps.size).toBe(0);
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
});
