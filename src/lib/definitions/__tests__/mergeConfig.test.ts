import { describe, it, expect } from "vitest";
import { mergeConfigContent, mergeKeyValueContent, mergeJsonContent } from "../mergeConfig";

describe("mergeKeyValueContent", () => {
  it("updates managed keys in place, preserving other lines and comments", () => {
    const existing = [
      "#Minecraft server properties",
      "server-port=25565",
      "enable-rcon=false",
      "level-name=world",
      "max-players=10",
    ].join("\n") + "\n";
    const rendered = "server-port=25565\nmax-players=32\nmotd=Hello\n";

    const out = mergeKeyValueContent(existing, rendered);
    const lines = out.split("\n");
    expect(lines[0]).toBe("#Minecraft server properties");
    expect(out).toContain("enable-rcon=false"); // unmanaged key survives
    expect(out).toContain("level-name=world");
    expect(out).toContain("max-players=32"); // updated value
    expect(out).not.toContain("max-players=10");
    expect(out).toContain("motd=Hello"); // new key appended
    // updated key stays in its original position, appended key goes last
    expect(lines.indexOf("max-players=32")).toBeLessThan(lines.indexOf("motd=Hello"));
    expect(out.endsWith("\n")).toBe(true);
  });

  it("preserves the existing line's separator and indentation when updating", () => {
    const existing = "spawn-protection : 16\n";
    const out = mergeKeyValueContent(existing, "spawn-protection=4\n");
    expect(out).toBe("spawn-protection : 4\n");
  });

  it("preserves CRLF line endings", () => {
    const existing = "a=1\r\nb=2\r\n";
    const out = mergeKeyValueContent(existing, "a=9\r\n");
    expect(out).toBe("a=9\r\nb=2\r\n");
  });

  it("appends new keys to an existing file without duplicating them", () => {
    const existing = "server-port=25565\n";
    const out = mergeKeyValueContent(existing, "server-port=25565\nview-distance=12\n");
    expect(out.match(/view-distance/g)).toHaveLength(1);
    expect(out).toContain("server-port=25565");
  });

  it("leaves section headers and unrecognized lines untouched (ini-style files)", () => {
    const existing = "[Server]\nPassword=old\n[/Script/Engine.GameEngine]\nFoo=bar\n";
    const out = mergeKeyValueContent(existing, "Password=new\n");
    expect(out).toContain("[Server]");
    expect(out).toContain("Password=new");
    expect(out).not.toContain("Password=old");
    expect(out).toContain("[/Script/Engine.GameEngine]");
    expect(out).toContain("Foo=bar");
  });

  it("escapes nothing special in values with template-triggering characters", () => {
    const existing = "motd=old\n";
    const out = mergeKeyValueContent(existing, "motd=$& player's world\n");
    expect(out).toBe("motd=$& player's world\n");
  });
});

describe("mergeJsonContent", () => {
  it("deep merges with rendered values winning", () => {
    const existing = JSON.stringify({ name: "A", gamePort: 15636, userGroups: [{ name: "Admin", reservedSlots: 2 }], extra: true });
    const rendered = JSON.stringify({ name: "B", userGroups: [{ name: "Admin", reservedSlots: 5 }] });
    const out = mergeJsonContent(existing, rendered);
    const parsed = JSON.parse(out!);
    expect(parsed.name).toBe("B");
    expect(parsed.gamePort).toBe(15636); // unmanaged key survives
    expect(parsed.extra).toBe(true);
    expect(parsed.userGroups[0].reservedSlots).toBe(5);
  });

  it("replaces arrays wholesale", () => {
    const existing = JSON.stringify({ list: [1, 2, 3] });
    const rendered = JSON.stringify({ list: [9] });
    expect(JSON.parse(mergeJsonContent(existing, rendered)!).list).toEqual([9]);
  });

  it("returns null when either side is not valid JSON", () => {
    expect(mergeJsonContent("not json", "{}")).toBeNull();
    expect(mergeJsonContent("{}", "not json")).toBeNull();
  });
});

describe("mergeConfigContent", () => {
  it("sniffs JSON files and deep merges", () => {
    const existing = '{"slotCount": 16, "name": "Old"}';
    const out = mergeConfigContent(existing, '{"slotCount": 32}');
    expect(JSON.parse(out).slotCount).toBe(32);
    expect(JSON.parse(out).name).toBe("Old");
  });

  it("falls back to key=value merge for non-JSON", () => {
    const out = mergeConfigContent("a=1\nkeep=me\n", "a=2\n");
    expect(out).toContain("a=2");
    expect(out).toContain("keep=me");
  });

  it("returns the rendered content verbatim for empty existing files (first boot)", () => {
    const rendered = "server-port=25565\n";
    expect(mergeConfigContent("", rendered)).toBe(rendered);
    expect(mergeConfigContent("   \n", rendered)).toBe(rendered);
  });
});
