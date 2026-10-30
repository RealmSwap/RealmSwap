import { describe, it, expect } from "vitest";
import { claimStart, releaseStart, isStartClaimed } from "../runners/startClaims";

describe("startClaims", () => {
  it("claims a server exactly once", () => {
    expect(claimStart("srv-1")).toBe(true);
    expect(claimStart("srv-1")).toBe(false);
    expect(isStartClaimed("srv-1")).toBe(true);
    releaseStart("srv-1");
    expect(isStartClaimed("srv-1")).toBe(false);
  });

  it("tracks servers independently", () => {
    expect(claimStart("srv-a")).toBe(true);
    expect(claimStart("srv-b")).toBe(true);
    releaseStart("srv-a");
    expect(isStartClaimed("srv-a")).toBe(false);
    expect(isStartClaimed("srv-b")).toBe(true);
    releaseStart("srv-b");
  });
});
