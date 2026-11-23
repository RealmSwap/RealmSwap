import { describe, it, expect } from "vitest";
import { buildMagicPacket } from "../wol";

describe("buildMagicPacket", () => {
  it("is 102 bytes: a 6× FF sync stream, then the MAC repeated 16 times", () => {
    const packet = buildMagicPacket("aa:bb:cc:dd:ee:ff");
    expect(packet.length).toBe(102);
    expect(packet.subarray(0, 6).equals(Buffer.alloc(6, 0xff))).toBe(true);
    const mac = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
    for (let i = 0; i < 16; i++) {
      expect(packet.subarray(6 + i * 6, 6 + i * 6 + 6).equals(mac)).toBe(true);
    }
  });

  it("accepts every common separator style", () => {
    const canonical = buildMagicPacket("aabbccddeeff");
    expect(buildMagicPacket("AA-BB-CC-DD-EE-FF").equals(canonical)).toBe(true);
    expect(buildMagicPacket("aa.bb.cc.dd.ee.ff").equals(canonical)).toBe(true);
  });

  it("refuses to broadcast garbage", () => {
    expect(() => buildMagicPacket("not-a-mac")).toThrow(/Not a MAC address/);
    expect(() => buildMagicPacket("aa:bb:cc:dd:ee")).toThrow(/Not a MAC address/);
    expect(() => buildMagicPacket("")).toThrow(/Not a MAC address/);
  });
});
