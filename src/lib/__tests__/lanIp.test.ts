import { describe, it, expect, vi } from "vitest";
import type { NetworkInterfaceInfo } from "os";

/**
 * getLanIP picks the address friends on the same network should join when
 * the router refused a port mapping. It used to return the first non-internal
 * IPv4 in interface order — on a box where a VPN/TAP adapter sits on a
 * 169.254 autoconf address ahead of the real NIC, Join Info advertised an
 * address nobody can reach.
 */

const hoisted = vi.hoisted(() => ({
  interfaces: {} as Record<string, NetworkInterfaceInfo[]>,
}));

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  const networkInterfaces = () => hoisted.interfaces;
  return { ...actual, networkInterfaces, default: { ...actual, networkInterfaces } };
});

import { getLanIP } from "@/lib/upnp";

function v4(address: string, internal = false): NetworkInterfaceInfo {
  return { address, netmask: "255.255.255.0", family: "IPv4", mac: "00:00:00:00:00:00", internal, cidr: `${address}/24` };
}

describe("getLanIP", () => {
  it("skips a link-local adapter enumerated ahead of the real NIC", () => {
    hoisted.interfaces = {
      "Loopback": [v4("127.0.0.1", true)],
      "Cloudflare WARP": [v4("169.254.83.107")],
      "Ethernet": [v4("192.168.1.42")],
    };
    expect(getLanIP()).toBe("192.168.1.42");
  });

  it("returns null when only loopback and link-local exist, so callers fall back to 127.0.0.1", () => {
    hoisted.interfaces = {
      "Loopback": [v4("127.0.0.1", true)],
      "Ethernet": [v4("169.254.10.20")],
    };
    expect(getLanIP()).toBeNull();
  });

  it("ignores IPv6 entries on the same adapter", () => {
    hoisted.interfaces = {
      "Ethernet": [
        { address: "fe80::1", netmask: "ffff:ffff:ffff:ffff::", family: "IPv6", mac: "00:00:00:00:00:00", internal: false, cidr: "fe80::1/64", scopeid: 0 },
        v4("10.0.0.5"),
      ],
    };
    expect(getLanIP()).toBe("10.0.0.5");
  });
});
