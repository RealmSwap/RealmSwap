import { describe, it, expect } from "vitest";
import { pickEntryPath } from "../authEntry";

describe("pickEntryPath", () => {
  it("routes an authenticated user to the dashboard", () => {
    expect(pickEntryPath({ isAuthenticated: true, userCount: 3 })).toBe("/dashboard");
  });

  it("routes an unauthenticated user to login when users exist", () => {
    expect(pickEntryPath({ isAuthenticated: false, userCount: 1 })).toBe("/login");
  });

  it("routes to register when no users exist yet", () => {
    expect(pickEntryPath({ isAuthenticated: false, userCount: 0 })).toBe("/register");
  });

  it("prefers the dashboard even on a fresh DB if somehow authenticated", () => {
    expect(pickEntryPath({ isAuthenticated: true, userCount: 0 })).toBe("/dashboard");
  });
});
