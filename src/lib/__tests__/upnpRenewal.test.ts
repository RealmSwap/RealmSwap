import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { renewMapping, upnpRenewalFailures, type RenewalState } from "../upnp";

// The router path's heartbeat: a UPnP mapping is kept alive by lease renewals,
// and a run of failed renewals is how "the router stopped forwarding" becomes
// knowable at all. These run against a local HTTP server standing in for the
// router's control URL; discovery is pre-seeded so no SSDP goes out.

type Endpoint = { serviceType: string; controlUrl: string; internalClient: string };
const globalForUpnp = globalThis as unknown as {
  upnpEndpoints?: Endpoint[];
  upnpDiscovering?: Promise<Endpoint[]>;
  upnpRenewals?: Map<string, unknown>;
};

type Scripted = { status: number; body: string } | "hang-up";

let server: http.Server;
let endpoint: Endpoint;
let responses: Scripted[];
let requests: string[];

const ok: Scripted = {
  status: 200,
  body: `<u:AddPortMappingResponse xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1"></u:AddPortMappingResponse>`,
};
const refused: Scripted = {
  status: 500,
  body: `<s:Fault><errorCode>718</errorCode><errorDescription>ConflictInMappingEntry</errorDescription></s:Fault>`,
};

beforeEach(async () => {
  responses = [];
  requests = [];
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      requests.push(raw);
      const next = responses.shift() ?? ok;
      if (next === "hang-up") {
        req.socket.destroy(); // the router stopped answering mid-request
        return;
      }
      res.writeHead(next.status, { "Content-Type": "text/xml" });
      res.end(next.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = {
    serviceType: "urn:schemas-upnp-org:service:WANIPConnection:1",
    controlUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/ctrl`,
    internalClient: "192.168.1.49",
  };
  // A gateway is cached, as it is after a server start mapped its ports...
  globalForUpnp.upnpEndpoints = [endpoint];
  // ...and a fresh discovery would find the same router again.
  globalForUpnp.upnpDiscovering = Promise.resolve([endpoint]);
  globalForUpnp.upnpRenewals = new Map();
});

afterEach(async () => {
  globalForUpnp.upnpEndpoints = undefined;
  globalForUpnp.upnpDiscovering = undefined;
  globalForUpnp.upnpRenewals = new Map();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const mapping = (failures = 0): RenewalState => ({
  port: 2456,
  protocol: "UDP",
  description: "RealmSwap",
  internalClient: "192.168.1.49",
  failures,
});

describe("UPnP lease renewal health", () => {
  it("a successful renewal resets the failure count", async () => {
    const state = mapping(2);
    responses.push(ok);
    await renewMapping(state);
    expect(state.failures).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("<NewExternalPort>2456</NewExternalPort>");
  });

  it("counts consecutive failures so a dying mapping becomes visible", async () => {
    const state = mapping();
    responses.push(refused, refused);
    await renewMapping(state);
    expect(state.failures).toBe(1);
    await renewMapping(state);
    expect(state.failures).toBe(2);
  });

  it("looks for the router again after it stopped answering once, instead of never renewing again", async () => {
    const state = mapping();
    responses.push("hang-up");
    await renewMapping(state);
    expect(state.failures).toBe(1);
    // The connection-level failure dropped the cached gateway.
    expect(globalForUpnp.upnpEndpoints).toBeUndefined();

    // Before the fix, the next renewal read that empty cache and returned
    // without sending anything — every renewal after one router hiccup was a
    // silent no-op, and the port closed when the lease ran out.
    responses.push(ok);
    await renewMapping(state);
    expect(requests).toHaveLength(2);
    expect(state.failures).toBe(0);
  });

  it("counts a failure when no router can be found at all", async () => {
    globalForUpnp.upnpEndpoints = undefined;
    globalForUpnp.upnpDiscovering = Promise.resolve([]);
    const state = mapping();
    await renewMapping(state);
    expect(state.failures).toBe(1);
    expect(requests).toHaveLength(0);
  });

  it("reports the worst failure count among a port's mappings, and 0 for unmapped ports", () => {
    const renewals = globalForUpnp.upnpRenewals as Map<string, unknown>;
    renewals.set("2456/UDP", { ...mapping(1), protocol: "UDP" });
    renewals.set("2456/TCP", { ...mapping(3), protocol: "TCP" });
    renewals.set("27015/UDP", { ...mapping(1), port: 27015 });
    expect(upnpRenewalFailures(2456)).toBe(3);
    expect(upnpRenewalFailures(27015)).toBe(1);
    expect(upnpRenewalFailures(9999)).toBe(0);
  });
});
