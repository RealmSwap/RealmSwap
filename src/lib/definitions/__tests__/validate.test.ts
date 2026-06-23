import { describe, it, expect } from "vitest";
import { validateSpec, validateParamValues } from "../validate";

const okSpec: any = {
  install: { appId: "1", installSubDir: "x", checkFile: "x.exe", requiredDiskGB: 1 },
  launch: { executable: "x.exe", args: ["-port", "{port}", "-name", "{name}"] },
  defaultPort: 2456, params: [], configFiles: [], ports: [{ protocol: "UDP", port: "{port}" }],
};

describe("validateSpec", () => {
  it("accepts a valid steamcmd spec", () => {
    expect(validateSpec(okSpec, "STEAMCMD")).toEqual([]);
  });
  it("rejects an unknown template variable", () => {
    const bad = { ...okSpec, launch: { executable: "x.exe", args: ["{bogus}"] } };
    expect(validateSpec(bad, "STEAMCMD").join()).toMatch(/bogus/);
  });
  it("accepts a declared param used in args", () => {
    const spec = { ...okSpec, params: [{ key: "slots", label: "Slots", type: "number", default: 8 }], launch: { executable: "x.exe", args: ["-players", "{slots}"] } };
    expect(validateSpec(spec, "STEAMCMD")).toEqual([]);
  });
  it("requires appId for steamcmd", () => {
    const bad = { ...okSpec, install: { installSubDir: "x", checkFile: "x.exe", requiredDiskGB: 1 } };
    expect(validateSpec(bad, "STEAMCMD").join()).toMatch(/appId/i);
  });
  it("requires options for enum params", () => {
    const spec = { ...okSpec, params: [{ key: "mode", label: "Mode", type: "enum" }] };
    expect(validateSpec(spec, "STEAMCMD").join()).toMatch(/options/i);
  });
});

describe("security: script execution gate", () => {
  it("rejects launchScript on a STEAMCMD spec (non-admin bypass)", () => {
    const spec: any = {
      ...okSpec,
      launch: { executable: "x.exe", args: [], launchScript: "calc.exe" },
    };
    const errs = validateSpec(spec, "STEAMCMD").join(" ");
    expect(errs).toMatch(/launchScript/i);
    expect(errs).toMatch(/CUSTOM_SCRIPT/i);
  });

  it("allows launchScript on a CUSTOM_SCRIPT spec", () => {
    const spec: any = {
      install: { installScript: "install.bat" },
      launch: { executable: "", args: [], launchScript: "start.bat" },
      defaultPort: 25565,
      params: [],
      configFiles: [],
      ports: [],
    };
    const errs = validateSpec(spec, "CUSTOM_SCRIPT");
    // No launchScript error; only errors (if any) are unrelated to launchScript/CUSTOM_SCRIPT
    expect(errs.some((e) => /launchScript.*CUSTOM_SCRIPT|CUSTOM_SCRIPT.*launchScript/i.test(e))).toBe(false);
  });
});

describe("security: path traversal gate", () => {
  it("rejects configFiles path with .. traversal", () => {
    const spec: any = {
      ...okSpec,
      configFiles: [{ path: "../../evil.bat", strategy: "template", template: "x" }],
    };
    const errs = validateSpec(spec, "STEAMCMD").join(" ");
    expect(errs).toMatch(/\.\.\.\.\/evil\.bat|\.\.\/\.\.\/evil\.bat|\.\./);
  });

  it("rejects editableConfigPath with .. traversal", () => {
    const spec: any = {
      ...okSpec,
      editableConfigPath: "../../../etc/x",
    };
    const errs = validateSpec(spec, "STEAMCMD").join(" ");
    expect(errs).toMatch(/\.\./);
  });

  it("allows a legal nested config path without .. segments", () => {
    const spec: any = {
      ...okSpec,
      configFiles: [{ path: "zomboid-data/Server/servertest.ini", strategy: "template", template: "x" }],
    };
    expect(validateSpec(spec, "STEAMCMD")).toEqual([]);
  });
});

describe("validateParamValues", () => {
  const params: any = [
    { key: "slots", label: "Slots", type: "number", min: 1, max: 32, required: true },
    { key: "mode", label: "Mode", type: "enum", options: ["pve", "pvp"] },
  ];
  it("accepts valid values", () => {
    expect(validateParamValues(params, { slots: 8, mode: "pvp" })).toEqual([]);
  });
  it("rejects out-of-range number", () => {
    expect(validateParamValues(params, { slots: 99 }).join()).toMatch(/slots/);
  });
  it("rejects bad enum", () => {
    expect(validateParamValues(params, { slots: 8, mode: "x" }).join()).toMatch(/mode/);
  });
  it("rejects missing required", () => {
    expect(validateParamValues(params, {}).join()).toMatch(/slots/);
  });
});
