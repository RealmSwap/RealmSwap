import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { dataRoot, dockerMountRoot, gameHost } from "../appPaths";

describe("dataRoot", () => {
  const original = process.env.GAMEVAULT_DATA_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.GAMEVAULT_DATA_DIR;
    else process.env.GAMEVAULT_DATA_DIR = original;
  });

  it("falls back to process.cwd() when GAMEVAULT_DATA_DIR is unset", () => {
    delete process.env.GAMEVAULT_DATA_DIR;
    expect(dataRoot()).toBe(process.cwd());
  });

  it("honors GAMEVAULT_DATA_DIR when set", () => {
    process.env.GAMEVAULT_DATA_DIR = path.join("C:", "fake", "data");
    expect(dataRoot()).toBe(path.join("C:", "fake", "data"));
  });

  it("ignores an empty GAMEVAULT_DATA_DIR", () => {
    process.env.GAMEVAULT_DATA_DIR = "";
    expect(dataRoot()).toBe(process.cwd());
  });
});

describe("dockerMountRoot + gameHost (headless deployment helpers)", () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ["GAMEVAULT_DATA_DIR", "GAMEVAULT_HOST_DATA_DIR", "GAMEVAULT_GAME_HOST"];

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("dockerMountRoot falls back to the data dir so native runs mount real data", () => {
    process.env.GAMEVAULT_DATA_DIR = "/app-data";
    expect(dockerMountRoot()).toBe("/app-data");
  });

  it("dockerMountRoot prefers the host-side override (containerized dashboard)", () => {
    process.env.GAMEVAULT_DATA_DIR = "/data";
    process.env.GAMEVAULT_HOST_DATA_DIR = "  /mnt/raid/realmswap  ";
    expect(dockerMountRoot()).toBe("/mnt/raid/realmswap");
  });

  it("dockerMountRoot ignores a blank override", () => {
    process.env.GAMEVAULT_HOST_DATA_DIR = "   ";
    expect(dockerMountRoot()).toBe(process.cwd());
  });

  it("gameHost defaults to loopback", () => {
    expect(gameHost()).toBe("127.0.0.1");
  });

  it("gameHost prefers GAMEVAULT_GAME_HOST", () => {
    process.env.GAMEVAULT_GAME_HOST = "host.docker.internal";
    expect(gameHost()).toBe("host.docker.internal");
  });
});
