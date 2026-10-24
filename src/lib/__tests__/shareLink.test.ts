import { describe, it, expect } from "vitest";
import { isLoopbackOrigin, statusPageUrl } from "../shareLink";

/**
 * The status-share link honesty rules: loopback origins (dev, packaged
 * Electron) can never produce a link that leaves the machine, because the
 * dashboard's port is the authenticated control plane and is never exposed.
 */
describe("isLoopbackOrigin", () => {
  it("flags every shape of loopback a dashboard can run on", () => {
    expect(isLoopbackOrigin("http://localhost:3000")).toBe(true);
    expect(isLoopbackOrigin("http://127.0.0.1:43110")).toBe(true);
    expect(isLoopbackOrigin("http://[::1]:3000")).toBe(true);
    expect(isLoopbackOrigin("http://app.localhost:3000")).toBe(true);
  });

  it("does not flag real hosts", () => {
    expect(isLoopbackOrigin("https://realmswap.app")).toBe(false);
    expect(isLoopbackOrigin("https://realmswap.app/s/abc")).toBe(false);
    expect(isLoopbackOrigin("http://192.168.1.20:3000")).toBe(false);
  });

  it("treats garbage as non-loopback rather than crashing", () => {
    expect(isLoopbackOrigin("not a url")).toBe(false);
    expect(isLoopbackOrigin("")).toBe(false);
  });
});

describe("statusPageUrl", () => {
  it("builds the /s/<code> path and tolerates a trailing slash", () => {
    expect(statusPageUrl("abc12345", "http://localhost:3000")).toBe("http://localhost:3000/s/abc12345");
    expect(statusPageUrl("abc12345", "https://realmswap.app/")).toBe("https://realmswap.app/s/abc12345");
  });
});
