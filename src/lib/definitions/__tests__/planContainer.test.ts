import { describe, it, expect } from "vitest";
import { buildContext } from "../context";
import { planContainer, DEFAULT_STEAMCMD_IMAGE } from "../plan";
import type { GameDefinitionSpec } from "../types";

function specWith(container: any): GameDefinitionSpec {
  return {
    install: { appId: "896660", installSubDir: "valheim-server", checkFile: "x", requiredDiskGB: 2.5 },
    launch: { executable: "x", args: [] },
    defaultPort: 2456,
    params: [],
    configFiles: [],
    ports: [],
    container,
  } as unknown as GameDefinitionSpec;
}

function ctx(spec: GameDefinitionSpec) {
  return buildContext({ name: "My Realm", password: null, port: 2456, ram: 6, paramValuesJson: null, spec });
}

describe("planContainer", () => {
  it("returns null when no container block is present", () => {
    const spec = specWith(undefined);
    expect(planContainer(spec, ctx(spec))).toBeNull();
  });

  it("resolves executable, rendered args, env, and defaults image + installSubDir", () => {
    const spec = specWith({
      executable: "valheim_server.x86_64",
      env: { SteamAppId: "892970" },
      args: ["-name", "{name}", "-port", "2456"],
    });
    expect(planContainer(spec, ctx(spec))).toEqual({
      image: DEFAULT_STEAMCMD_IMAGE,
      installSubDir: "valheim-server",
      executable: "valheim_server.x86_64",
      args: ["-name", "My Realm", "-port", "2456"],
      env: { SteamAppId: "892970" },
    });
  });

  it("honors image override and explicit installSubDir, applies includeWhen filtering", () => {
    const spec = specWith({
      image: "ghcr.io/example/custom",
      installSubDir: "custom-dir",
      args: ["always", { value: ["-pw", "{password}"], includeWhen: "password" }],
    });
    const p = planContainer(spec, ctx(spec))!;
    expect(p.image).toBe("ghcr.io/example/custom");
    expect(p.installSubDir).toBe("custom-dir");
    expect(p.args).toEqual(["always"]); // password empty -> omitted
    expect(p.env).toBeUndefined();
  });

  it("renders template variables inside env values", () => {
    const spec = specWith({ executable: "srv", env: { WORLD_NAME: "{name}" }, args: [] });
    expect(planContainer(spec, ctx(spec))!.env).toEqual({ WORLD_NAME: "My Realm" });
  });
});
