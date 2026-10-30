import { describe, it, expect } from "vitest";
import { advertisedGameAddress, classifyAddressPath } from "../advertisedAddress";

describe("advertisedGameAddress", () => {
  it("uses the tunnel address when a tunnel is live — the only routable path behind CGNAT", () => {
    expect(
      advertisedGameAddress(
        { tunnelUrl: "my-server.auto.playit.gg:12345", ipAddress: "203.0.113.5", port: 25565 },
        true
      )
    ).toBe("my-server.auto.playit.gg:12345");
  });

  it("falls back to the recorded address when no tunnel is live", () => {
    expect(
      advertisedGameAddress(
        { tunnelUrl: "my-server.auto.playit.gg:12345", ipAddress: "203.0.113.5", port: 25565 },
        false
      )
    ).toBe("203.0.113.5:25565");
  });

  it("a saved tunnelUrl with no live agent does NOT win (dead address)", () => {
    expect(
      advertisedGameAddress({ tunnelUrl: "dead.playit.gg:1", ipAddress: "10.0.0.2", port: 25565 }, false)
    ).toBe("10.0.0.2:25565");
  });

  it("loopback last resort when no address is recorded", () => {
    expect(advertisedGameAddress({ port: 25565 }, false)).toBe("127.0.0.1:25565");
  });
});

describe("classifyAddressPath", () => {
  it("a live tunnel is the private path regardless of the recorded address", () => {
    expect(
      classifyAddressPath(
        { tunnelUrl: "my-server.auto.playit.gg:12345", ipAddress: "203.0.113.5", port: 25565 },
        true
      )
    ).toBe("tunnel");
  });

  it("a saved-but-dead tunnel does not count as the active path", () => {
    expect(
      classifyAddressPath(
        { tunnelUrl: "dead.playit.gg:1", ipAddress: "203.0.113.5", port: 25565 },
        false
      )
    ).toBe("public");
  });

  it("Routable public IPs are the exposed path", () => {
    expect(
      classifyAddressPath({ ipAddress: "203.0.113.5", port: 25565 }, false)
    ).toBe("public");
  });

  it.each([
    ["192.168.1.50"],
    ["10.0.0.2"],
    ["172.16.4.9"],
    ["172.31.255.1"],
    ["169.254.12.7"],
  ])("RFC1918 + link-local %s read as LAN", (ip) => {
    expect(classifyAddressPath({ ipAddress: ip, port: 25565 }, false)).toBe("lan");
  });

  it.each([
    ["172.32.0.1"],
    ["192.169.0.1"],
    ["11.0.0.1"],
  ])("public-range lookalikes like %s are NOT LAN", (ip) => {
    expect(classifyAddressPath({ ipAddress: ip, port: 25565 }, false)).toBe("public");
  });

  it("loopback and no address are local-only", () => {
    expect(classifyAddressPath({ ipAddress: "127.0.0.1", port: 25565 }, false)).toBe("loopback");
    expect(classifyAddressPath({ port: 25565 }, false)).toBe("loopback");
  });

  it("IPv6 unique-local and link-local (with zone) read as LAN; global addresses do not", () => {
    expect(classifyAddressPath({ ipAddress: "fd12:3456:789a::1", port: 25565 }, false)).toBe("lan");
    expect(classifyAddressPath({ ipAddress: "fe80::1%en0", port: 25565 }, false)).toBe("lan");
    expect(classifyAddressPath({ ipAddress: "2606:4f00::1", port: 25565 }, false)).toBe("public");
    expect(classifyAddressPath({ ipAddress: "[2606:4f00::1]", port: 25565 }, false)).toBe("public");
  });

  it("unparseable addresses fail safe toward the privacy warning", () => {
    expect(classifyAddressPath({ ipAddress: "not-an-ip", port: 25565 }, false)).toBe("public");
  });
});
