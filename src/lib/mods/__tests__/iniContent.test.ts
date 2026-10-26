import { describe, it, expect } from "vitest";
import { addZomboidWorkshopModContent, removeZomboidWorkshopModContent } from "@/lib/mods/zomboid";
import { addArkActiveModContent, removeArkActiveModContent } from "@/lib/mods/ark";

/**
 * The content-based ini twins shared by the local fs writers and the
 * agent-node flow (which reads/writes ini content over the file commands).
 * Same segment/section rules as the fs versions — these guard the sharing.
 */

describe("zomboid content twins", () => {
  const existing = "Password=secret\nWorkshopItems=111;222\nMods=ModA;ModB\n";

  it("adds the workshop id and every mod id, preserving unrelated lines", () => {
    const out = addZomboidWorkshopModContent(existing, "333", ["ModC", "ModD"]);
    expect(out).toContain("Password=secret");
    expect(out).toContain("WorkshopItems=111;222;333");
    expect(out).toContain("Mods=ModA;ModB;ModC;ModD");
  });

  it("is idempotent", () => {
    const once = addZomboidWorkshopModContent(existing, "333", ["ModC"]);
    expect(addZomboidWorkshopModContent(once, "333", ["ModC"])).toBe(once);
  });

  it("removes only the targeted ids", () => {
    const out = removeZomboidWorkshopModContent(existing, "111", ["ModA"]);
    expect(out).toContain("WorkshopItems=222");
    expect(out).toContain("Mods=ModB");
    expect(out).not.toContain("ModA");
    expect(out).toContain("Password=secret");
  });

  it("creates both keys on an empty ini", () => {
    const out = addZomboidWorkshopModContent("", "42", ["X"]);
    expect(out).toContain("WorkshopItems=42");
    expect(out).toContain("Mods=X");
  });
});

describe("ark content twins", () => {
  it("appends within the sectioned [ServerSettings], order = load order", () => {
    const ini = "[ServerSettings]\nActiveMods=111\n[SomeOther]\nKey=Value\n";
    const out = addArkActiveModContent(ini, "222");
    expect(out).toContain("ActiveMods=111,222");
    expect(out).toContain("[SomeOther]\nKey=Value");
  });

  it("creates a fresh section on an empty file", () => {
    expect(addArkActiveModContent("", "42")).toBe("[ServerSettings]\nActiveMods=42\n");
  });

  it("remove returns null when the id isn't listed (caller leaves the ini alone)", () => {
    const ini = "[ServerSettings]\nActiveMods=111\n";
    expect(removeArkActiveModContent(ini, "999")).toBeNull();
    const out = removeArkActiveModContent(ini, "111");
    expect(out).toContain("ActiveMods=");
    expect(out).not.toContain("111");
  });
});
