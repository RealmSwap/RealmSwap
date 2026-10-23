import { describe, it, expect } from "vitest";
import { advertisedGameAddress } from "../advertisedAddress";

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
