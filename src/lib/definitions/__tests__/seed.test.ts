import { describe, it, expect } from "vitest";
import { buildBuiltinData } from "../seed";
import { BUILTIN_DEFINITIONS } from "../builtins";

describe("buildBuiltinData", () => {
  it("produces global (ownerId null) built-in data with serialized spec", () => {
    const valheim = BUILTIN_DEFINITIONS.find((d) => d.slug === "VALHEIM")!;
    const data = buildBuiltinData(valheim);
    expect(data.slug).toBe("VALHEIM");
    expect(data.ownerId).toBeNull();
    expect(data.isBuiltIn).toBe(true);
    expect(data.installMethod).toBe("STEAMCMD");
    expect(data.requiredDiskGB).toBe(2.5);
    expect(typeof data.spec).toBe("string");
  });
});
