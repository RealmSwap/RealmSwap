import { describe, it, expect } from "vitest";
import { secureSecretEquals } from "../secureCompare";

describe("secureSecretEquals", () => {
  it("matches equal secrets", () => {
    expect(secureSecretEquals("hunter2", "hunter2")).toBe(true);
  });

  it("rejects wrong secrets", () => {
    expect(secureSecretEquals("hunter2", "hunter3")).toBe(false);
    expect(secureSecretEquals("hunter2", "")).toBe(false);
    expect(secureSecretEquals("hunter2", null)).toBe(false);
    expect(secureSecretEquals("hunter2", undefined)).toBe(false);
  });

  it("fails closed when the expected secret is unset — the 'Bearer undefined' bug class", () => {
    // With a plain `header !== \`Bearer ${env}\`` comparison, an unset env var
    // authenticates the literal string "Bearer undefined". This must never
    // match anything.
    expect(secureSecretEquals(undefined, "undefined")).toBe(false);
    expect(secureSecretEquals(undefined, "Bearer undefined")).toBe(false);
    expect(secureSecretEquals(undefined, "")).toBe(false);
    expect(secureSecretEquals("", "anything")).toBe(false);
  });
});
