import { describe, it, expect } from "vitest";
import { renderTemplate, collectVariables, renderArgs } from "../template";

const ctx: any = { name: "My World", nameSanitized: "My_World", password: "secret", port: 2456, ram: 4 };

describe("renderTemplate", () => {
  it("substitutes known variables", () => {
    expect(renderTemplate("-port {port} -name {name}", ctx)).toBe("-port 2456 -name My World");
  });
  it("supports concatenation", () => {
    expect(renderTemplate("{password}_admin", ctx)).toBe("secret_admin");
  });
  it("throws on unknown variable", () => {
    expect(() => renderTemplate("{nope}", ctx)).toThrow(/Unknown template variable/);
  });
});

describe("collectVariables", () => {
  it("lists referenced variables", () => {
    expect(collectVariables("{a} text {b}{a}").sort()).toEqual(["a", "b"]);
  });
});

describe("renderArgs", () => {
  it("renders literal and template args", () => {
    expect(renderArgs(["-port", "{port}"], ctx)).toEqual(["-port", "2456"]);
  });
  it("includes a conditional group when the variable is non-empty", () => {
    expect(renderArgs([{ value: ["-pass", "{password}"], includeWhen: "password" }], ctx)).toEqual(["-pass", "secret"]);
  });
  it("omits a conditional group when the variable is empty", () => {
    expect(renderArgs([{ value: ["-pass", "{password}"], includeWhen: "password" }], { ...ctx, password: "" })).toEqual([]);
  });
});
