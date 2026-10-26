import { describe, it, expect, vi } from "vitest";
import {
  PlayitApi,
  PlayitApiFailure,
  findTunnelForPort,
  isPlayitFailure,
  tunnelPortTypeFor,
  tunnelProtocolCovers,
  AgentRunData,
} from "../playitApi";
import { BUILTIN_DEFINITIONS } from "../definitions/builtins";

function fetchJson(payload: unknown, status = 200) {
  return vi.fn(async (_url: string, _init: any) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function tunnel(
  id: string,
  localPort: string | null,
  opts: { address?: string; disabled?: string; portType?: "tcp" | "udp" | "both" } = {}
) {
  return {
    id,
    display_address: opts.disabled ? null : opts.address ?? `${id}.auto.playit.gg:40000`,
    disabled_reason: opts.disabled ?? null,
    ...(opts.portType ? { port_type: opts.portType } : {}),
    agent_config: {
      fields: localPort === null ? [] : [{ name: "local_port", value: localPort }],
    },
  };
}

const spec = (slug: string) => BUILTIN_DEFINITIONS.find((d) => d.slug === slug)!.spec;

describe("PlayitApi envelope handling", () => {
  it("unwraps success payloads", async () => {
    const api = new PlayitApi(fetchJson({ status: "success", data: { agent_id: "a1" } }));
    const data = await api.getRunData("secret");
    expect(data.agent_id).toBe("a1");
  });

  it("turns fail envelopes into PlayitApiFailure carrying the variant", async () => {
    const api = new PlayitApi(fetchJson({ status: "fail", data: "CodeNotFound" }));
    await expect(api.claimExchange("nope")).rejects.toSatisfy((err: unknown) => isPlayitFailure(err, "CodeNotFound"));
  });

  it("surfaces error envelopes with their message", async () => {
    const api = new PlayitApi(fetchJson({ status: "error", data: { type: "validation", message: "failed to parse body" } }));
    await expect(api.claimSetup("abc")).rejects.toThrow(/failed to parse body/);
  });

  it("rejects non-2xx and non-JSON responses instead of guessing", async () => {
    const api = new PlayitApi(vi.fn(async () => new Response("Not Found", { status: 404 })));
    await expect(api.getRunData("secret")).rejects.toThrow(/HTTP 404/);

    const htmlApi = new PlayitApi(vi.fn(async () => new Response("<html>oops</html>", { status: 200 })));
    await expect(htmlApi.getRunData("secret")).rejects.toThrow(/non-JSON/);
  });
});

describe("PlayitApi request shapes", () => {
  it("sends claim setup with self-managed agent type and no auth header", async () => {
    const fetchImpl = fetchJson({ status: "success", data: "WaitingForUserVisit" });
    const api = new PlayitApi(fetchImpl);
    const state = await api.claimSetup("deadbeef01");

    expect(state).toBe("WaitingForUserVisit");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.playit.gg/claim/setup");
    expect(JSON.parse(init.body)).toEqual({ code: "deadbeef01", agent_type: "self-managed", version: "realmswap" });
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("authenticates rundata with the Agent-Key scheme", async () => {
    const fetchImpl = fetchJson({ status: "success", data: {} });
    const api = new PlayitApi(fetchImpl);
    await api.getRunData("agentsecret");

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe("Agent-Key agentsecret");
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("creates a tunnel bound to 127.0.0.1:<port> via agent config fields, with the game's protocol", async () => {
    const fetchImpl = fetchJson({ status: "success", data: { id: "tunnel-1" } });
    const api = new PlayitApi(fetchImpl);
    const id = await api.createTunnel("agentsecret", "agent-1", 15637, "udp");

    expect(id).toBe("tunnel-1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.playit.gg/v1/tunnels/create");
    const body = JSON.parse(init.body);
    expect(body.ports).toEqual({ type: "custom-udp", details: 1 });
    expect(body.origin).toEqual({
      type: "agent",
      data: {
        agent_id: "agent-1",
        config: {
          fields: [
            { name: "local_ip", value: "127.0.0.1" },
            { name: "local_port", value: "15637" },
          ],
        },
      },
    });
    expect(body.enabled).toBe(true);
  });

  it("maps each port type onto playit's custom-* tunnel types", async () => {
    for (const portType of ["tcp", "udp", "both"] as const) {
      const fetchImpl = fetchJson({ status: "success", data: { id: "t" } });
      await new PlayitApi(fetchImpl).createTunnel("k", "a", 1, portType);
      expect(JSON.parse(fetchImpl.mock.calls[0][1].body).ports).toEqual({ type: `custom-${portType}`, details: 1 });
    }
  });

  it("deletes a tunnel by id with the agent key", async () => {
    const fetchImpl = fetchJson({ status: "success", data: null });
    const api = new PlayitApi(fetchImpl);
    await api.deleteTunnel("agentsecret", "tunnel-1");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.playit.gg/tunnels/delete");
    expect(JSON.parse(init.body)).toEqual({ tunnel_id: "tunnel-1" });
    expect(init.headers.Authorization).toBe("Agent-Key agentsecret");
  });

  it("extracts the agent secret from the exchange payload and rejects junk", async () => {
    const good = new PlayitApi(fetchJson({ status: "success", data: { secret_key: "abcdef1234567890abcdef1234567890" } }));
    await expect(good.claimExchange("code")).resolves.toBe("abcdef1234567890abcdef1234567890");

    const bad = new PlayitApi(fetchJson({ status: "success", data: { secret_key: "drop table" } }));
    await expect(bad.claimExchange("code")).rejects.toThrow(/no usable agent secret/);
  });
});

describe("claim code + url", () => {
  it("generates 10-hex codes and matching claim urls", () => {
    const api = new PlayitApi(fetchJson({ status: "success", data: null }));
    const code = api.generateClaimCode();
    expect(code).toMatch(/^[0-9a-f]{10}$/);
    expect(api.claimUrl(code)).toBe(`https://playit.gg/claim/${code}`);
  });
});

describe("tunnelPortTypeFor", () => {
  it("UDP-only games get a UDP tunnel (a TCP one forwards nothing)", () => {
    expect(tunnelPortTypeFor(spec("VALHEIM"), 2456)).toBe("udp");
    expect(tunnelPortTypeFor(spec("PALWORLD"), 8211)).toBe("udp");
    expect(tunnelPortTypeFor(spec("VRISING"), 9876)).toBe("udp");
    // Enshrouded's spec still over-declares TCP until #161 lands (then this
    // becomes "udp"); either way a UDP game must never get a TCP-only tunnel.
    expect(tunnelPortTypeFor(spec("ENSHROUDED"), 15637)).not.toBe("tcp");
  });

  it("only entries for THIS port count — Rust's TCP is RCON on another port", () => {
    expect(tunnelPortTypeFor(spec("RUST"), 28015)).toBe("udp");
  });

  it("games declaring both protocols on the join port get both", () => {
    expect(tunnelPortTypeFor(spec("SATISFACTORY"), 7777)).toBe("both");
    expect(tunnelPortTypeFor({ ports: [{ protocol: "TCP", port: "1" }, { protocol: "UDP", port: "1" }] }, 1)).toBe("both");
  });

  it("TCP-only joins (Minecraft Java, Terraria) stay TCP, so existing tunnels are not churned", () => {
    expect(tunnelPortTypeFor(spec("MINECRAFT"), 25565)).toBe("tcp");
    expect(tunnelPortTypeFor(spec("TERRARIA"), 7777)).toBe("tcp");
  });

  it("templated ports can't be resolved and count for their protocol", () => {
    expect(tunnelPortTypeFor({ ports: [{ protocol: "UDP", port: "{{port}}" }] }, 4242)).toBe("udp");
  });

  it("nothing declared for the port → both, the only answer that can't be wrong", () => {
    expect(tunnelPortTypeFor({ ports: [] }, 25565)).toBe("both");
    expect(tunnelPortTypeFor({ ports: [{ protocol: "TCP", port: "28016" }] }, 28015)).toBe("both");
  });
});

describe("tunnelProtocolCovers", () => {
  it("a both-tunnel covers any need; otherwise protocols must match", () => {
    expect(tunnelProtocolCovers("both", "udp")).toBe(true);
    expect(tunnelProtocolCovers("both", "tcp")).toBe(true);
    expect(tunnelProtocolCovers("both", "both")).toBe(true);
    expect(tunnelProtocolCovers("tcp", "tcp")).toBe(true);
    expect(tunnelProtocolCovers("udp", "udp")).toBe(true);
  });

  it("a single-protocol tunnel never covers the other protocol or a both need", () => {
    expect(tunnelProtocolCovers("tcp", "udp")).toBe(false);
    expect(tunnelProtocolCovers("udp", "tcp")).toBe(false);
    expect(tunnelProtocolCovers("tcp", "both")).toBe(false);
    expect(tunnelProtocolCovers("udp", "both")).toBe(false);
  });
});

describe("findTunnelForPort", () => {
  const runData: AgentRunData = {
    agent_id: "a1",
    tunnels: [
      tunnel("other", "9999"),
      tunnel("mine", "25565", { address: "mine.auto.playit.gg:1234", portType: "tcp" }),
    ],
  };

  it("matches the tunnel whose local_port field equals the game port, carrying id and protocol", () => {
    expect(findTunnelForPort(runData, 25565)).toEqual({
      id: "mine",
      portType: "tcp",
      displayAddress: "mine.auto.playit.gg:1234",
      disabled: false,
      disabledReason: null,
    });
  });

  it("reports disabled tunnels instead of their address", () => {
    const data: AgentRunData = { agent_id: "a1", tunnels: [tunnel("mine", "25565", { disabled: "disabled_over_limit" })] };
    expect(findTunnelForPort(data, 25565)).toEqual({
      id: "mine",
      portType: null,
      displayAddress: null,
      disabled: true,
      disabledReason: "disabled_over_limit",
    });
  });

  it("an unknown or missing port_type reads as null, never as a mismatch", () => {
    const data: AgentRunData = { agent_id: "a1", tunnels: [{ ...tunnel("mine", "25565"), port_type: "weird" as any }] };
    expect(findTunnelForPort(data, 25565)?.portType).toBeNull();
  });

  it("returns null when nothing is bound to the port yet", () => {
    expect(findTunnelForPort(runData, 7777)).toBeNull();
    expect(findTunnelForPort({ agent_id: "a1", tunnels: [] }, 25565)).toBeNull();
    expect(findTunnelForPort(null, 25565)).toBeNull();
  });
});
