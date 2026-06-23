import { describe, it, expect } from "vitest";
import { parseSpec, stringifySpec, parseParamValues, stringifyParamValues } from "../serialize";

describe("serialize", () => {
  it("round-trips a spec", () => {
    const spec = stringifySpec({
      install: { appId: "1", installSubDir: "x", checkFile: "x.exe", requiredDiskGB: 1 },
      launch: { executable: "x.exe", args: ["-port", "{port}"] },
      defaultPort: 1234, params: [], configFiles: [], ports: [],
    } as any);
    expect(parseSpec(spec).defaultPort).toBe(1234);
  });

  it("parses null param values to empty object", () => {
    expect(parseParamValues(null)).toEqual({});
  });

  it("round-trips param values", () => {
    const json = stringifyParamValues({ difficulty: "hard", slots: 8, pvp: true });
    expect(parseParamValues(json)).toEqual({ difficulty: "hard", slots: 8, pvp: true });
  });
});
