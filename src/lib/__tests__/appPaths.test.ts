import { describe, it, expect, afterEach } from "vitest";
import path from "path";
import { dataRoot } from "../appPaths";

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
