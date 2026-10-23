import * as crypto from "crypto";

/**
 * Client for the playit REST API (https://api.playit.gg), mirroring what the
 * official agent binary does (playit-cloud/playit-agent, packages/api_client):
 * every call is POST with a JSON body; the response envelope is
 * {"status":"success"|"fail"|"error","data":...}; authenticated calls carry
 * `Authorization: Agent-Key <agent secret>`. The claim endpoints take no auth.
 *
 * RealmSwap drives the whole tunnel lifecycle itself: generate a claim code,
 * poll /claim/setup until the user approves it in the browser, exchange it for
 * an agent secret, spawn playitd with that secret, then create the tunnel
 * bound to the game port via /v1/tunnels/create — zero playit-dashboard steps.
 */
export const PLAYIT_API_BASE = "https://api.playit.gg";

export type PlayitFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The API reports failures inside a 200 envelope; carry the variant string. */
export class PlayitApiFailure extends Error {
  constructor(public readonly kind: string) {
    super(`playit API failure: ${kind}`);
  }
}

export interface AgentTunnelField {
  name: string;
  value: string;
}

export interface AgentTunnel {
  id?: string;
  name?: string;
  display_address?: string | null;
  disabled_reason?: string | null;
  agent_config?: { fields?: AgentTunnelField[] } | null;
}

export interface AgentRunData {
  agent_id?: string;
  tunnels?: AgentTunnel[];
  pending?: unknown[];
}

export interface TunnelForPort {
  displayAddress: string | null;
  disabled: boolean;
  disabledReason: string | null;
}

export const CLAIM_SETUP_STATES = ["WaitingForUserVisit", "WaitingForUser", "UserAccepted", "UserRejected"] as const;
export type ClaimSetupState = (typeof CLAIM_SETUP_STATES)[number];

export function isPlayitFailure(err: unknown, ...kinds: string[]): boolean {
  return err instanceof PlayitApiFailure && kinds.includes(err.kind);
}

export class PlayitApi {
  constructor(
    private readonly fetchImpl: PlayitFetch = fetch,
    private readonly base: string = PLAYIT_API_BASE,
    private readonly requestTimeoutMs = 15_000
  ) {}

  /** Same shape as the official CLI: 10 random hex chars (main.rs claim_generate). */
  generateClaimCode(): string {
    return crypto.randomBytes(5).toString("hex");
  }

  claimUrl(code: string): string {
    return `https://playit.gg/claim/${code}`;
  }

  private async call(path: string, body: unknown, agentKey?: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(agentKey ? { Authorization: `Agent-Key ${agentKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (err: any) {
      throw new Error(`playit API ${path} unreachable: ${err?.message || err}`);
    }
    if (!res.ok) {
      throw new Error(`playit API ${path} failed: HTTP ${res.status}`);
    }
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error(`playit API ${path} returned a non-JSON response`);
    }
    if (json?.status === "success") return json.data;
    if (json?.status === "fail") throw new PlayitApiFailure(String(json.data ?? "UnknownFailure"));
    throw new Error(`playit API ${path} error: ${json?.data?.message ?? "unknown error"}`);
  }

  async claimSetup(code: string): Promise<ClaimSetupState> {
    const data = await this.call("/claim/setup", {
      code,
      agent_type: "self-managed",
      version: "realmswap",
    });
    if (typeof data !== "string" || !CLAIM_SETUP_STATES.includes(data as ClaimSetupState)) {
      throw new Error(`playit claim/setup returned unexpected state: ${JSON.stringify(data)}`);
    }
    return data as ClaimSetupState;
  }

  async claimExchange(code: string): Promise<string> {
    const data = (await this.call("/claim/exchange", { code })) as any;
    const secret = data?.secret_key;
    if (typeof secret !== "string" || secret.length < 16 || !/^[A-Za-z0-9_-]+$/.test(secret)) {
      throw new Error("playit claim/exchange returned no usable agent secret");
    }
    return secret;
  }

  async getRunData(agentKey: string): Promise<AgentRunData> {
    return (await this.call("/v1/agents/rundata", {}, agentKey)) as AgentRunData;
  }

  /**
   * Create a TCP tunnel bound to 127.0.0.1:localPort on the agent (the local
   * binding travels in origin agent_config fields — the config file cannot
   * pre-seed tunnels). `ports.details` is the port COUNT, mirroring the
   * legacy /tunnels/create port_count.
   */
  async createTcpTunnel(agentKey: string, agentId: string, localPort: number): Promise<string | null> {
    const data = (await this.call(
      "/v1/tunnels/create",
      {
        name: `RealmSwap ${localPort}`,
        ports: { type: "custom-tcp", details: 1 },
        origin: {
          type: "agent",
          data: {
            agent_id: agentId,
            config: {
              fields: [
                { name: "local_ip", value: "127.0.0.1" },
                { name: "local_port", value: String(localPort) },
              ],
            },
          },
        },
        enabled: true,
      },
      agentKey
    )) as any;
    return typeof data?.id === "string" ? data.id : null;
  }
}

/**
 * Find the agent's tunnel bound to a local port (rundata tunnels carry the
 * binding as agent_config fields). Returns null when no tunnel is bound yet.
 */
export function findTunnelForPort(runData: AgentRunData | null | undefined, localPort: number): TunnelForPort | null {
  for (const tunnel of runData?.tunnels ?? []) {
    const portField = tunnel.agent_config?.fields?.find((f) => f.name === "local_port");
    if (portField === undefined || Number(portField.value) !== localPort) continue;
    return {
      displayAddress: tunnel.display_address ?? null,
      disabled: !!tunnel.disabled_reason,
      disabledReason: tunnel.disabled_reason ?? null,
    };
  }
  return null;
}
