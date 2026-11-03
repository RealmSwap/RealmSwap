import { describe, it, expect, vi, beforeEach } from "vitest";

// isV2Payload gates which deploy path a realm payload takes. Every payload
// written before the verified pipeline existed must keep deploying the legacy
// way, so the detection has to be conservative.

import { isV2Payload, TemplatePayload } from "../types";

const legacy = (over: Partial<TemplatePayload> = {}): TemplatePayload => ({
  version: "1.0.0",
  mods: [{ provider: "thunderstore", packageId: "some-Pack", name: "Some Pack" } as any],
  configOverrides: [],
  startupParams: {},
  ...over,
});

describe("isV2Payload", () => {
  it("classifies every pre-v2 shape as legacy", () => {
    expect(isV2Payload(null)).toBe(false);
    expect(isV2Payload(undefined)).toBe(false);
    expect(isV2Payload(legacy())).toBe(false);
    expect(isV2Payload(legacy({ mods: [] }))).toBe(false);
    // v1 rows never carried versions — they were all "latest" placeholders.
    expect(isV2Payload(legacy({ mods: [{ provider: "workshop", packageId: "1", name: "x", version: "latest" }] } as any))).toBe(false);
    expect(isV2Payload(legacy({ mods: [{ provider: "manual", packageId: "jar", name: "jar" }] } as any))).toBe(false);
  });

  it("classifies loader/modpack/pinned-mod payloads as v2", () => {
    expect(isV2Payload(legacy({ loader: { type: "fabric", loaderVersion: "0.20.1", minecraftVersion: "1.21.1" } }))).toBe(true);
    expect(isV2Payload(legacy({ modpack: { kind: "curseforge", projectId: "907066" } }))).toBe(true);
    expect(
      isV2Payload(legacy({ mods: [{ provider: "modrinth", packageId: "carpet", name: "Carpet", version: "1.21.1-1.4" }] }))
    ).toBe(true);
  });
});
