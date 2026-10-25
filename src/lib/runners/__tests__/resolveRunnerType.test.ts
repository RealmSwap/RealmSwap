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
  it("returns AGENT only when requested, the node is enrolled, and the game has a container plan", () => {
    expect(resolveRunnerType("AGENT", { hasContainer: true, dockerAvailable: false, nodeEnrolled: true })).toBe("AGENT");
    // Without a container plan the deploy would only fail at first START —
    // refuse it here instead of silently falling back to LOCAL.
    expect(resolveRunnerType("AGENT", { hasContainer: false, dockerAvailable: false, nodeEnrolled: true })).toBe("LOCAL");
    expect(resolveRunnerType("AGENT", { hasContainer: true, dockerAvailable: true, nodeEnrolled: false })).toBe("LOCAL");
    expect(resolveRunnerType("AGENT", { hasContainer: true, dockerAvailable: true })).toBe("LOCAL");
  });
});
