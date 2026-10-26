import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The tunnel pieces that changed for node servers: the pure release-asset
 * table (dashboard resolves the NODE's platform from its heartbeat), and the
 * liveness registry fed by the agent heartbeat (isTunnelAlive must reflect
 * node daemons, staleness-bounded, without touching prisma at runtime).
 * prisma/appPaths are mocked at the module boundary — the functions under
 * test never reach them.
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/appPaths", () => ({ dataRoot: () => "/unused" }));

import { playitReleaseFor, noteAgentTunnels, isTunnelAlive } from "@/lib/tunnels";

describe("playitReleaseFor", () => {
  it("maps the node platforms playit publishes", () => {
    expect(playitReleaseFor("linux", "x64")?.url).toContain("playit-linux-amd64");
    expect(playitReleaseFor("win32", "x64")?.url).toContain("playit-windows-x86_64.exe");
    expect(playitReleaseFor("win32", "arm64")?.binName).toBe("playit.exe");
  });

  it("returns null where no build exists (macOS) instead of a 404 URL", () => {
    expect(playitReleaseFor("darwin", "arm64")).toBeNull();
    expect(playitReleaseFor("linux", "arm64")).toBeNull();
  });
});

describe("noteAgentTunnels / isTunnelAlive", () => {
  beforeEach(() => {
    // Clear whatever previous tests left in the registry.
    noteAgentTunnels([]);
  });

  it("heartbeats are authoritative: the full alive set replaces the old one", () => {
    noteAgentTunnels(["a", "b"]);
    expect(isTunnelAlive("a")).toBe(true);
    expect(isTunnelAlive("b")).toBe(true);

    noteAgentTunnels(["a"]);
    expect(isTunnelAlive("a")).toBe(true);
    expect(isTunnelAlive("b")).toBe(false);
  });

  it("non-string entries are dropped, not crashing the sync route", () => {
    noteAgentTunnels([undefined as unknown as string, "ok"]);
    expect(isTunnelAlive("ok")).toBe(true);
  });
});
