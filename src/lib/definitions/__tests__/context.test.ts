import { describe, it, expect } from "vitest";
import { buildContext } from "../context";

const baseSpec: any = { install: {}, launch: { executable: "x", args: [] }, defaultPort: 1, params: [], configFiles: [], ports: [] };

describe("buildContext", () => {
  it("sanitizes the name", () => {
    const ctx = buildContext({ name: "My World!", password: null, port: 1, ram: 4, paramValuesJson: null, spec: baseSpec });
    expect(ctx.nameSanitized).toBe("My_World_");
  });

  it("applies password fallback when too short", () => {
    const spec = { ...baseSpec, passwordPolicy: { minLength: 5, fallback: "viking123" } };
    const ctx = buildContext({ name: "x", password: "abc", port: 1, ram: 4, paramValuesJson: null, spec });
    expect(ctx.password).toBe("viking123");
  });

  it("keeps a valid password", () => {
    const spec = { ...baseSpec, passwordPolicy: { minLength: 5, fallback: "viking123" } };
    const ctx = buildContext({ name: "x", password: "longenough", port: 1, ram: 4, paramValuesJson: null, spec });
    expect(ctx.password).toBe("longenough");
  });

  it("merges param defaults then stored values", () => {
    const spec = { ...baseSpec, params: [{ key: "slots", label: "Slots", type: "number", default: 8 }] };
    const ctx = buildContext({ name: "x", password: "", port: 1, ram: 4, paramValuesJson: JSON.stringify({ slots: 16 }), spec });
    expect(ctx.slots).toBe(16);
  });

  it("falls back to param default when no stored value", () => {
    const spec = { ...baseSpec, params: [{ key: "slots", label: "Slots", type: "number", default: 8 }] };
    const ctx = buildContext({ name: "x", password: "", port: 1, ram: 4, paramValuesJson: null, spec });
    expect(ctx.slots).toBe(8);
  });
});
