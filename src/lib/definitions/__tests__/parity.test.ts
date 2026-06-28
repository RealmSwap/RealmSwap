import { describe, it, expect } from "vitest";
import { BUILTIN_DEFINITIONS } from "../builtins";
import { buildContext } from "../context";
import { planLaunch, planPorts, planInstall, planContainer } from "../plan";

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
    // PATH command: must be flagged so the runner spawns "java" from PATH rather
    // than resolving it against the install dir (<installDir>\java -> ENOENT).
    expect(p.executableOnPath).toBe(true);
    expect(p.args).toEqual(["-Xms512M", "-Xmx4G", "-jar", "server.jar", "nogui"]);
  });
});

describe("parity: PATH-command launchers are flagged executableOnPath", () => {
  // System commands resolved on PATH (not produced by the install) must set
  // executableOnPath; otherwise the runner joins them to the install dir and the
  // spawn fails with ENOENT (e.g. <installDir>\java). Install-produced binaries
  // like valheim_server.exe are correctly resolved against the install dir.
  const PATH_COMMANDS = new Set(["java", "cmd.exe"]);
  for (const d of BUILTIN_DEFINITIONS) {
    const exe = (d.spec.launch as any).executable as string;
    if (PATH_COMMANDS.has(exe)) {
      it(`${d.slug} (${exe}) sets executableOnPath`, () => {
        expect((d.spec.launch as any).executableOnPath).toBe(true);
      });
    }
  }
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

describe("container: Valheim", () => {
  it("produces a Linux container plan with rendered args and env", () => {
    const c = ctxFor("VALHEIM", { name: "Viking Realm", password: "abc", ram: 6 }); // short pw -> viking123
    const p = planContainer(def("VALHEIM").spec, c)!;
    expect(p).not.toBeNull();
    expect(p.image).toBe("cm2network/steamcmd");
    expect(p.installSubDir).toBe("valheim-server");
    expect(p.executable).toBe("valheim_server.x86_64");
    expect(p.env).toEqual({ LD_LIBRARY_PATH: "./linux64", SteamAppId: "892970" });
    expect(p.args).toEqual([
      "-nographics", "-batchmode", "-name", "Viking Realm", "-port", "2456",
      "-world", "Dedicated", "-password", "viking123", "-public", "1", "-crossplay",
    ]);
  });
});

describe("container: Project Zomboid", () => {
  it("produces a Linux container plan with cachedir arg", () => {
    const c = ctxFor("ZOMBOID", { name: "Zomboid Server", password: null, ram: 8 });
    const p = planContainer(def("ZOMBOID").spec, c)!;
    expect(p).not.toBeNull();
    expect(p.image).toBe("cm2network/steamcmd");
    expect(p.installSubDir).toBe("zomboid-server");
    expect(p.executable).toBe("start-server.sh");
    expect(p.args).toContain("-cachedir=/data/zomboid-server/zomboid-data");
    expect(p.args).toContain("-servername");
    expect(p.args).toContain("servertest");
  });
});

describe("container: Terraria", () => {
  it("produces a Linux container plan with world name args", () => {
    const c = ctxFor("TERRARIA", { name: "My World!", password: null, ram: 2 });
    const p = planContainer(def("TERRARIA").spec, c)!;
    expect(p).not.toBeNull();
    expect(p.image).toBe("cm2network/steamcmd");
    expect(p.installSubDir).toBe("terraria-server");
    expect(p.executable).toBe("TerrariaServer.bin.x86_64");
    expect(p.args).toContain("-port");
    expect(p.args).toContain("7777");
    expect(p.args).toContain("-worldname");
    expect(p.args).toContain("My_World_");
  });
});

describe("container: Palworld", () => {
  it("produces a Linux container plan with password in args", () => {
    const c = ctxFor("PALWORLD", { name: "Pals", password: "pw", ram: 8 });
    const p = planContainer(def("PALWORLD").spec, c)!;
    expect(p).not.toBeNull();
    expect(p.image).toBe("cm2network/steamcmd");
    expect(p.installSubDir).toBe("palworld-server");
    expect(p.executable).toBe("PalServer.sh");
    expect(p.args).toContain("?port=8211?players=16?AdminPassword=pw");
  });
});

describe("container: Rust", () => {
  it("produces a Linux container plan with LD_LIBRARY_PATH env", () => {
    const c = ctxFor("RUST", { name: "Rust Box", password: null, ram: 10 });
    const p = planContainer(def("RUST").spec, c)!;
    expect(p).not.toBeNull();
    expect(p.image).toBe("cm2network/steamcmd");
    expect(p.installSubDir).toBe("rust-server");
    expect(p.executable).toBe("RustDedicated");
    expect(p.env).toEqual({ LD_LIBRARY_PATH: "." });
    expect(p.args).toContain("+server.hostname");
    expect(p.args).toContain("Rust Box");
  });
});

describe("container: ARK", () => {
  it("produces a Linux container plan with correct executable path", () => {
    const c = ctxFor("ARK", { name: "The Island", password: "pw", ram: 12 });
    const p = planContainer(def("ARK").spec, c)!;
    expect(p).not.toBeNull();
    expect(p.image).toBe("cm2network/steamcmd");
    expect(p.installSubDir).toBe("ark-server");
    expect(p.executable).toBe("ShooterGame/Binaries/Linux/ShooterGameServer");
    expect(p.args).toContain("TheIsland?SessionName=The Island?ServerPassword=pw?Port=7777?QueryPort=27015?MaxPlayers=20");
  });
});
