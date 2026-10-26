import { describe, it, expect, vi } from "vitest";
import { runConnectivityChecks } from "../connectivityCheck";
import { BUILTIN_DEFINITIONS } from "../definitions/builtins";
import type { BoundSocket } from "../boundPorts";

const mc = BUILTIN_DEFINITIONS.find((d) => d.slug === "MINECRAFT")!;
const vh = BUILTIN_DEFINITIONS.find((d) => d.slug === "VALHEIM")!;
const en = BUILTIN_DEFINITIONS.find((d) => d.slug === "ENSHROUDED")!;
const rust = BUILTIN_DEFINITIONS.find((d) => d.slug === "RUST")!;

type ServerLike = {
  id: string; name: string; status: string; port: number;
  enableUpnp: boolean; tunnelUrl: string | null; runnerType?: string | null;
};

function server(over: Partial<ServerLike> = {}): ServerLike {
  return {
    id: "s1", name: "Test", status: "RUNNING", port: 25565,
    enableUpnp: true, tunnelUrl: null, ...over,
  };
}

type DepsLike = {
  boundSockets: () => Promise<BoundSocket[] | null>;
  connect: (port: number) => Promise<boolean>;
  publicIP: () => Promise<string | null>;
  platform: NodeJS.Platform;
  tunnelAlive: (serverId: string) => boolean;
};

const deps = (over: Partial<DepsLike> = {}): DepsLike => ({
  boundSockets: async () => [{ protocol: "TCP", port: 25565, pid: 4120 }],
  connect: async () => true,
  publicIP: async () => "203.0.113.10",
  platform: "win32" as NodeJS.Platform,
  tunnelAlive: () => true,
  ...over,
});

const listen = (r: Awaited<ReturnType<typeof runConnectivityChecks>>) => r.checks.find((c) => c.id === "listen")!;

describe("runConnectivityChecks", () => {
  it("fully healthy server reports ready", async () => {
    const r = await runConnectivityChecks(server(), mc.spec, deps());
    expect(r.overall).toBe("ready");
    expect(r.checks.find((c) => c.id === "router")?.status).toBe("ok");
    expect(listen(r).status).toBe("ok");
    expect(listen(r).detail).toBe("Port 25565 is open locally (TCP).");
  });

  it("stopped server is a hard fail with a clear reason", async () => {
    const r = await runConnectivityChecks(server({ status: "STOPPED" }), mc.spec, deps());
    expect(r.overall).toBe("blocked");
    expect(r.checks.find((c) => c.id === "server")?.status).toBe("fail");
    // listen check skipped, not failed, while stopped
    expect(listen(r).status).toBe("skip");
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

  it("nothing bound to the port while running is a fail that names both protocols", async () => {
    const r = await runConnectivityChecks(server(), mc.spec, deps({ boundSockets: async () => [] }));
    expect(listen(r).status).toBe("fail");
    expect(listen(r).detail).toMatch(/bound to port 25565 \(TCP or UDP\)/);
  });

  describe("UDP games are judged by what the OS has bound, not by a TCP connect", () => {
    it("Enshrouded: UDP 15637 bound reads as listening even though a TCP connect would fail", async () => {
      const r = await runConnectivityChecks(
        server({ port: 15637 }),
        en.spec,
        deps({ boundSockets: async () => [{ protocol: "UDP", port: 15637, pid: 6204 }], connect: async () => false })
      );
      expect(listen(r).status).toBe("ok");
      expect(listen(r).detail).toBe("Port 15637 is open locally (UDP).");
      expect(r.overall).toBe("ready");
    });

    it("Valheim: UDP 2456 bound is ok; an unbound UDP port is a real fail", async () => {
      const ok = await runConnectivityChecks(
        server({ port: 2456 }), vh.spec,
        deps({ boundSockets: async () => [{ protocol: "UDP", port: 2456 }] })
      );
      expect(listen(ok).status).toBe("ok");

      const gone = await runConnectivityChecks(
        server({ port: 2456 }), vh.spec,
        deps({ boundSockets: async () => [{ protocol: "UDP", port: 2457 }] })
      );
      expect(listen(gone).status).toBe("fail");
    });

    it("Rust: the spec's TCP entry is RCON on another port — the UDP game port decides", async () => {
      const r = await runConnectivityChecks(
        server({ port: 28015 }), rust.spec,
        deps({ boundSockets: async () => [{ protocol: "UDP", port: 28015 }, { protocol: "TCP", port: 28016 }] })
      );
      expect(listen(r).status).toBe("ok");
      expect(listen(r).detail).toBe("Port 28015 is open locally (UDP).");
    });

    it("a port bound on both protocols lists both", async () => {
      const r = await runConnectivityChecks(
        server({ port: 7777 }), mc.spec,
        deps({ boundSockets: async () => [{ protocol: "UDP", port: 7777 }, { protocol: "TCP", port: 7777 }] })
      );
      expect(listen(r).detail).toBe("Port 7777 is open locally (TCP + UDP).");
    });
  });

  describe("when the OS can't be asked", () => {
    it("TCP games fall back to the TCP connect", async () => {
      const up = await runConnectivityChecks(server(), mc.spec, deps({ boundSockets: async () => null, connect: async () => true }));
      expect(listen(up).status).toBe("ok");
      expect(listen(up).detail).toBe("Port 25565 answers locally.");

      const down = await runConnectivityChecks(server(), mc.spec, deps({ boundSockets: async () => null, connect: async () => false }));
      expect(listen(down).status).toBe("fail");
    });

    it("UDP-only games skip instead of false-failing", async () => {
      const connect = vi.fn(async () => false);
      const r = await runConnectivityChecks(server({ port: 2456 }), vh.spec, deps({ boundSockets: async () => null, connect }));
      expect(listen(r).status).toBe("skip");
      expect(connect).not.toHaveBeenCalled();
    });

    it("a TCP entry for a different port (Rust RCON) does not make the UDP game port TCP-probeable", async () => {
      const connect = vi.fn(async () => false);
      const r = await runConnectivityChecks(server({ port: 28015 }), rust.spec, deps({ boundSockets: async () => null, connect }));
      expect(listen(r).status).toBe("skip");
      expect(connect).not.toHaveBeenCalled();
    });

    it("a throwing probe is 'can't tell', not 'nothing bound'", async () => {
      const r = await runConnectivityChecks(
        server(), mc.spec,
        deps({ boundSockets: async () => { throw new Error("netstat exploded"); }, connect: async () => true })
      );
      expect(listen(r).status).toBe("ok");
    });
  });

  it("node-hosted servers skip the local probe — this machine can't see the node's sockets", async () => {
    const boundSockets = vi.fn(async () => []);
    const r = await runConnectivityChecks(server({ runnerType: "AGENT" }), mc.spec, deps({ boundSockets }));
    expect(listen(r).status).toBe("skip");
    expect(listen(r).detail).toMatch(/runs on a node/);
    expect(boundSockets).not.toHaveBeenCalled();
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
