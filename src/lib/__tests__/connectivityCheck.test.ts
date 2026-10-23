import { describe, it, expect } from "vitest";
import { runConnectivityChecks } from "../connectivityCheck";
import { BUILTIN_DEFINITIONS } from "../definitions/builtins";

const mc = BUILTIN_DEFINITIONS.find((d) => d.slug === "MINECRAFT")!;
const vh = BUILTIN_DEFINITIONS.find((d) => d.slug === "VALHEIM")!;

type ServerLike = { id: string; name: string; status: string; port: number; enableUpnp: boolean; tunnelUrl: string | null };

function server(over: Partial<ServerLike> = {}): ServerLike {
  return {
    id: "s1", name: "Test", status: "RUNNING", port: 25565,
    enableUpnp: true, tunnelUrl: null, ...over,
  };
}

type DepsLike = { connect: (port: number) => Promise<boolean>; publicIP: () => Promise<string | null>; platform: NodeJS.Platform; tunnelAlive: (serverId: string) => boolean };

const deps = (over: Partial<DepsLike> = {}): DepsLike => ({
  connect: async () => true,
  publicIP: async () => "203.0.113.10",
  platform: "win32" as NodeJS.Platform,
  tunnelAlive: () => true,
  ...over,
});

describe("runConnectivityChecks", () => {
  it("fully healthy server reports ready", async () => {
    const r = await runConnectivityChecks(server(), mc.spec, deps());
    expect(r.overall).toBe("ready");
    expect(r.checks.find((c) => c.id === "router")?.status).toBe("ok");
    expect(r.checks.find((c) => c.id === "listen")?.status).toBe("ok");
  });

  it("stopped server is a hard fail with a clear reason", async () => {
    const r = await runConnectivityChecks(server({ status: "STOPPED" }), mc.spec, deps());
    expect(r.overall).toBe("blocked");
    expect(r.checks.find((c) => c.id === "server")?.status).toBe("fail");
    // listen check skipped, not failed, while stopped
    expect(r.checks.find((c) => c.id === "listen")?.status).toBe("skip");
  });

  it("no tunnel and no UPnP blocks with a copyable fix", async () => {
    const r = await runConnectivityChecks(server({ enableUpnp: false }), mc.spec, deps());
    const router = r.checks.find((c) => c.id === "router")!;
    expect(router.status).toBe("fail");
    expect(router.fixCommand).toMatch(/tunnel/i);
    expect(r.overall).toBe("blocked");
  });

  it("unresponsive router with UPnP on fails with guidance", async () => {
    const r = await runConnectivityChecks(server(), mc.spec, deps({ publicIP: async () => null }));
    expect(r.checks.find((c) => c.id === "router")?.status).toBe("fail");
  });

  it("tunnel overrides router concerns entirely", async () => {
    const r = await runConnectivityChecks(
      server({ enableUpnp: false, tunnelUrl: "x.playit.gg:1234" }),
      mc.spec,
      deps({ publicIP: async () => null })
    );
    expect(r.checks.find((c) => c.id === "router")?.status).toBe("ok");
  });

  it("stale tunnel address (no live agent) warns instead of claiming ready", async () => {
    const r = await runConnectivityChecks(
      server({ enableUpnp: false, tunnelUrl: "x.playit.gg:1234" }),
      mc.spec,
      deps({ publicIP: async () => null, tunnelAlive: () => false })
    );
    expect(r.checks.find((c) => c.id === "router")?.status).toBe("warn");
  });

  it("game not listening while running is a fail", async () => {
    const r = await runConnectivityChecks(server(), mc.spec, deps({ connect: async () => false }));
    expect(r.checks.find((c) => c.id === "listen")?.status).toBe("fail");
  });

  it("UDP-only games skip the listen probe instead of false-failing", async () => {
    const r = await runConnectivityChecks(server({ port: 2456 }), vh.spec, deps({ connect: async () => false }));
    expect(r.checks.find((c) => c.id === "listen")?.status).toBe("skip");
  });

  it("Windows gets a firewall hint naming the real executable; other platforms skip", async () => {
    const win = await runConnectivityChecks(server(), mc.spec, deps());
    const fw = win.checks.find((c) => c.id === "firewall")!;
    expect(fw.status).toBe("warn");
    expect(fw.fixCommand).toContain("java");

    const mac = await runConnectivityChecks(server(), mc.spec, deps({ platform: "darwin" }));
    expect(mac.checks.find((c) => c.id === "firewall")?.status).toBe("skip");
  });

  it("the advisory firewall warn does not downgrade an otherwise healthy server", async () => {
    const r = await runConnectivityChecks(server(), mc.spec, deps());
    expect(r.checks.find((c) => c.id === "firewall")?.status).toBe("warn");
    expect(r.overall).toBe("ready");
  });
});
