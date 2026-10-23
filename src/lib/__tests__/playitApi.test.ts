import { describe, it, expect, vi } from "vitest";
import {
  PlayitApi,
  PlayitApiFailure,
  findTunnelForPort,
  isPlayitFailure,
  AgentRunData,
} from "../playitApi";

function fetchJson(payload: unknown, status = 200) {
  return vi.fn(async (_url: string, _init: any) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function tunnel(id: string, localPort: string | null, opts: { address?: string; disabled?: string } = {}) {
  return {
    id,
    display_address: opts.disabled ? null : opts.address ?? `${id}.auto.playit.gg:40000`,
    disabled_reason: opts.disabled ?? null,
    agent_config: {
      fields: localPort === null ? [] : [{ name: "local_port", value: localPort }],
    },
  };
}

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

  it("creates a TCP tunnel bound to 127.0.0.1:<port> via agent config fields", async () => {
    const fetchImpl = fetchJson({ status: "success", data: { id: "tunnel-1" } });
    const api = new PlayitApi(fetchImpl);
    const id = await api.createTcpTunnel("agentsecret", "agent-1", 25565);

    expect(id).toBe("tunnel-1");
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.ports).toEqual({ type: "custom-tcp", details: 1 });
    expect(body.origin).toEqual({
      type: "agent",
      data: {
        agent_id: "agent-1",
        config: {
          fields: [
            { name: "local_ip", value: "127.0.0.1" },
            { name: "local_port", value: "25565" },
          ],
        },
      },
    });
    expect(body.enabled).toBe(true);
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

describe("findTunnelForPort", () => {
  const runData: AgentRunData = {
    agent_id: "a1",
    tunnels: [
      tunnel("other", "9999"),
      tunnel("mine", "25565", { address: "mine.auto.playit.gg:1234" }),
    ],
  };

  it("matches the tunnel whose local_port field equals the game port", () => {
    expect(findTunnelForPort(runData, 25565)).toEqual({
      displayAddress: "mine.auto.playit.gg:1234",
      disabled: false,
      disabledReason: null,
    });
  });

  it("reports disabled tunnels instead of their address", () => {
    const data: AgentRunData = { agent_id: "a1", tunnels: [tunnel("mine", "25565", { disabled: "disabled_over_limit" })] };
    expect(findTunnelForPort(data, 25565)).toEqual({
      displayAddress: null,
      disabled: true,
      disabledReason: "disabled_over_limit",
    });
  });

  it("returns null when nothing is bound to the port yet", () => {
    expect(findTunnelForPort(runData, 7777)).toBeNull();
    expect(findTunnelForPort({ agent_id: "a1", tunnels: [] }, 25565)).toBeNull();
    expect(findTunnelForPort(null, 25565)).toBeNull();
  });
});
