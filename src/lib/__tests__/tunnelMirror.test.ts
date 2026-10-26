import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * mirrorTunnelState's protocol handling: a tunnel on the right port with the
 * wrong protocol forwards nothing (every tunnel created before protocols
 * were honored was TCP, including those in front of UDP games). Its address
 * must never reach tunnelUrl; it is deleted exactly once and rebuilt with the
 * game's protocol. prisma/appPaths/agents are mocked at the boundary; the
 * playit API is a scripted object.
 */

const h = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/db", () => ({
  prisma: {
    server: {
      update: vi.fn(async (args: { data: Record<string, unknown> }) => { h.updates.push(args.data); return {}; }),
      findUnique: vi.fn(async () => null),
    },
  },
}));
vi.mock("@/lib/appPaths", () => ({ dataRoot: () => "/unused" }));
vi.mock("@/lib/agents/commands", () => ({
  enqueueCommand: vi.fn(),
  resolveUsableNode: vi.fn(),
  awaitCommandResult: vi.fn(),
}));

import { mirrorTunnelState } from "@/lib/tunnels";
import type { AgentRunData } from "@/lib/playitApi";

function tunnel(id: string, port: number, portType: "tcp" | "udp" | "both" | undefined, address: string) {
  return {
    id,
    display_address: address,
    disabled_reason: null,
    ...(portType ? { port_type: portType } : {}),
    agent_config: { fields: [{ name: "local_port", value: String(port) }] },
  };
}

/** Scripted rundata: one entry per poll; the loop is cancelled once the last
 *  entry has been served and processed. */
function scriptedApi(polls: AgentRunData[], overrides: Partial<{ deleteTunnel: () => Promise<void> }> = {}) {
  let served = 0;
  const api = {
    getRunData: vi.fn(async () => {
      const data = polls[Math.min(served, polls.length - 1)];
      served++;
      return data;
    }),
    createTunnel: vi.fn(async () => "new-id"),
    deleteTunnel: vi.fn(overrides.deleteTunnel ?? (async () => {})),
  };
  const cancelled = () => served >= polls.length;
  return { api, cancelled };
}

const tunnelUrls = () => h.updates.filter((d) => "tunnelUrl" in d).map((d) => d.tunnelUrl);

describe("mirrorTunnelState protocol handling", () => {
  beforeEach(() => { h.updates.length = 0; });

  it("a wrong-protocol tunnel is never advertised, deleted once, and rebuilt with the game's protocol", async () => {
    const old = tunnel("old", 15637, "tcp", "old.playit.gg:1");
    const fresh = tunnel("new", 15637, "udp", "new.playit.gg:2");
    const { api, cancelled } = scriptedApi([
      { agent_id: "agent", tunnels: [old] },
      { agent_id: "agent", tunnels: [old] },   // rundata still lists it right after delete
      { agent_id: "agent", tunnels: [] },      // gone → create path
      { agent_id: "agent", tunnels: [fresh] },
    ]);

    await mirrorTunnelState({
      serverId: "s1", port: 15637, portType: "udp", secret: "secret", api,
      cancelled, stillAlive: () => true, onDaemonGone: () => {}, pollMs: 1,
    });

    expect(api.deleteTunnel).toHaveBeenCalledTimes(1);
    expect(api.deleteTunnel).toHaveBeenCalledWith("secret", "old");
    expect(api.createTunnel).toHaveBeenCalledTimes(1);
    expect(api.createTunnel).toHaveBeenCalledWith("secret", "agent", 15637, "udp");
    expect(tunnelUrls()).not.toContain("old.playit.gg:1");
    expect(tunnelUrls()).toContain("new.playit.gg:2");
  });

  it("a tunnel with the right protocol is left alone and its address mirrored", async () => {
    const { api, cancelled } = scriptedApi([
      { agent_id: "agent", tunnels: [tunnel("ok", 2456, "udp", "ok.playit.gg:3")] },
      { agent_id: "agent", tunnels: [tunnel("ok", 2456, "udp", "ok.playit.gg:3")] },
    ]);

    await mirrorTunnelState({
      serverId: "s1", port: 2456, portType: "udp", secret: "secret", api,
      cancelled, stillAlive: () => true, onDaemonGone: () => {}, pollMs: 1,
    });

    expect(api.deleteTunnel).not.toHaveBeenCalled();
    expect(api.createTunnel).not.toHaveBeenCalled();
    expect(tunnelUrls()).toEqual(["ok.playit.gg:3"]);
  });

  it("an unknown port_type is not a mismatch — never churn on missing data", async () => {
    const { api, cancelled } = scriptedApi([
      { agent_id: "agent", tunnels: [tunnel("legacy", 25565, undefined, "legacy.playit.gg:4")] },
    ]);

    await mirrorTunnelState({
      serverId: "s1", port: 25565, portType: "both", secret: "secret", api,
      cancelled, stillAlive: () => true, onDaemonGone: () => {}, pollMs: 1,
    });

    expect(api.deleteTunnel).not.toHaveBeenCalled();
    expect(tunnelUrls()).toEqual(["legacy.playit.gg:4"]);
  });

  it("an existing TCP+UDP tunnel covers a UDP need — kept, address and all", async () => {
    const { api, cancelled } = scriptedApi([
      { agent_id: "agent", tunnels: [tunnel("wide", 15637, "both", "wide.playit.gg:6")] },
    ]);

    await mirrorTunnelState({
      serverId: "s1", port: 15637, portType: "udp", secret: "secret", api,
      cancelled, stillAlive: () => true, onDaemonGone: () => {}, pollMs: 1,
    });

    expect(api.deleteTunnel).not.toHaveBeenCalled();
    expect(tunnelUrls()).toEqual(["wide.playit.gg:6"]);
  });

  it("a failed replacement is attempted once, and the dead address still never lands", async () => {
    const stuck = tunnel("stuck", 8211, "tcp", "stuck.playit.gg:5");
    const { api, cancelled } = scriptedApi(
      [
        { agent_id: "agent", tunnels: [stuck] },
        { agent_id: "agent", tunnels: [stuck] },
        { agent_id: "agent", tunnels: [stuck] },
      ],
      { deleteTunnel: async () => { throw new Error("playit API /tunnels/delete failed: HTTP 403"); } },
    );

    await mirrorTunnelState({
      serverId: "s1", port: 8211, portType: "udp", secret: "secret", api,
      cancelled, stillAlive: () => true, onDaemonGone: () => {}, pollMs: 1,
    });

    expect(api.deleteTunnel).toHaveBeenCalledTimes(1);
    expect(api.createTunnel).not.toHaveBeenCalled();
    expect(tunnelUrls()).not.toContain("stuck.playit.gg:5");
  });

  it("with no tunnel on the port, the first create uses the game's protocol", async () => {
    const { api, cancelled } = scriptedApi([
      { agent_id: "agent", tunnels: [] },
      { agent_id: "agent", tunnels: [] },
    ]);

    await mirrorTunnelState({
      serverId: "s1", port: 28015, portType: "udp", secret: "secret", api,
      cancelled, stillAlive: () => true, onDaemonGone: () => {}, pollMs: 1,
    });

    expect(api.createTunnel).toHaveBeenCalledTimes(1);
    expect(api.createTunnel).toHaveBeenCalledWith("secret", "agent", 28015, "udp");
  });
});
