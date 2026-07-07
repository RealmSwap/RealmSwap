import { describe, it, expect } from "vitest";
import { pickEntryPath } from "../authEntry";

describe("pickEntryPath", () => {
  it("routes an authenticated user to the dashboard", () => {
    expect(pickEntryPath({ isAuthenticated: true })).toBe("/dashboard");
  });

  it("routes an unauthenticated user to login", () => {
    expect(pickEntryPath({ isAuthenticated: false })).toBe("/login");
  });
});
