import { describe, it, expect } from "vitest";
import { BUILTIN_DEFINITIONS } from "../builtins";
import { buildContext } from "../context";
import { planLaunch, planPorts, planInstall } from "../plan";

function def(slug: string) {
  const d = BUILTIN_DEFINITIONS.find((x) => x.slug === slug)!;
  return d;
}
function ctxFor(slug: string, opts: { name: string; password: string | null; ram: number }) {
  const d = def(slug);
  return buildContext({ name: opts.name, password: opts.password, port: d.spec.defaultPort, ram: opts.ram, paramValuesJson: null, spec: d.spec });
}

describe("parity: Minecraft", () => {
  it("argv matches localRunner", () => {
    const c = ctxFor("MINECRAFT", { name: "Survival World", password: null, ram: 4 });
    const p = planLaunch(def("MINECRAFT").spec, c);
    expect(p.executable).toBe("java");
    expect(p.args).toEqual(["-Xms512M", "-Xmx4G", "-jar", "server.jar", "nogui"]);
  });
});

describe("parity: Valheim", () => {
  it("argv matches and applies password fallback", () => {
    const c = ctxFor("VALHEIM", { name: "Viking Realm", password: "abc", ram: 6 }); // too short -> viking123
    const p = planLaunch(def("VALHEIM").spec, c);
    expect(p.args).toEqual(["-nographics", "-batchmode", "-name", "Viking Realm", "-port", "2456", "-world", "Dedicated", "-password", "viking123", "-public", "1", "-crossplay"]);
    expect(planPorts(def("VALHEIM").spec, c)).toEqual([
      { protocol: "UDP", port: 2456 }, { protocol: "UDP", port: 2457 }, { protocol: "UDP", port: 2458 },
    ]);
  });
});

describe("parity: ARK", () => {
  it("password present", () => {
    const c = ctxFor("ARK", { name: "The Island Survival", password: "pw", ram: 12 });
    const p = planLaunch(def("ARK").spec, c);
    expect(p.args).toEqual(["TheIsland?SessionName=The Island Survival?ServerPassword=pw?Port=7777?QueryPort=27015?MaxPlayers=20", "-server", "-nosound", "-QueryPort=27015"]);
  });
  it("password empty", () => {
    const c = ctxFor("ARK", { name: "Island", password: null, ram: 12 });
    const p = planLaunch(def("ARK").spec, c);
    expect(p.args).toEqual(["TheIsland?SessionName=Island?Port=7777?QueryPort=27015?MaxPlayers=20", "-server", "-nosound", "-QueryPort=27015"]);
  });
});

describe("parity: Terraria", () => {
  it("sanitizes world name and omits password when empty", () => {
    const c = ctxFor("TERRARIA", { name: "My World!", password: null, ram: 2 });
    const p = planLaunch(def("TERRARIA").spec, c);
    expect(p.args).toEqual(["-port", "7777", "-players", "8", "-autocreate", "1", "-worldname", "My_World_", "-world", "worlds/My_World_.wld"]);
  });
});

describe("parity: Palworld", () => {
  it("password present", () => {
    const c = ctxFor("PALWORLD", { name: "Pals", password: "pw", ram: 8 });
    const p = planLaunch(def("PALWORLD").spec, c);
    expect(p.args).toEqual(["?port=8211?players=16?AdminPassword=pw", "-useperfthreads", "-NoAsyncLoadingThread", "-UseMultithreadForDS"]);
  });
});

describe("parity: Rust", () => {
  it("uses rcon password fallback", () => {
    const c = ctxFor("RUST", { name: "Rust Box", password: null, ram: 10 });
    const p = planLaunch(def("RUST").spec, c);
    expect(p.args).toEqual([
      "-batchmode", "+server.port", "28015", "+server.identity", "servertest",
      "+server.seed", "12345", "+server.worldsize", "3000", "+server.maxplayers", "10",
      "+server.hostname", "Rust Box", "+rcon.port", "28016", "+rcon.password", "changeme123", "+rcon.web", "1",
    ]);
  });
});

describe("parity: install targets", () => {
  it("valheim steam install", () => {
    expect(planInstall(def("VALHEIM").spec, "STEAMCMD")).toMatchObject({ appId: "896660", checkFile: "valheim_server.exe", requiredDiskGB: 2.5 });
  });
});
