import { describe, it, expect } from "vitest";
import { resolveRunnerType } from "../resolveRunnerType";

describe("resolveRunnerType", () => {
  it("defaults to LOCAL when nothing requested", () => {
    expect(resolveRunnerType(undefined, { hasContainer: true, dockerAvailable: true })).toBe("LOCAL");
    expect(resolveRunnerType("LOCAL", { hasContainer: true, dockerAvailable: true })).toBe("LOCAL");
  });
  it("returns DOCKER only when requested, supported, and available", () => {
    expect(resolveRunnerType("DOCKER", { hasContainer: true, dockerAvailable: true })).toBe("DOCKER");
  });
  it("falls back to LOCAL when DOCKER requested but unsupported or unavailable", () => {
    expect(resolveRunnerType("DOCKER", { hasContainer: false, dockerAvailable: true })).toBe("LOCAL");
    expect(resolveRunnerType("DOCKER", { hasContainer: true, dockerAvailable: false })).toBe("LOCAL");
  });
});
