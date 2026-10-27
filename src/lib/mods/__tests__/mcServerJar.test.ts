import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { resolveVanillaServerJar, applyVanillaServerSwap } from "../mcServerJar";

let currentBytes = Buffer.from("jar-bytes");

vi.mock("@/lib/download", () => ({
  downloadFile: async (_url: string, dest: string) => {
    fs.writeFileSync(dest, currentBytes);
  },
}));

const jsonRes = (data: any) => ({ ok: true, status: 200, json: async () => data }) as any;

function stubPistonMeta(opts: {
  versions?: { id: string; url: string; type: string }[];
  serverDownload?: { url: string; sha1?: string } | null;
}) {
  vi.stubGlobal(
    "fetch",
    (async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("version_manifest_v2.json")) {
        return jsonRes({ latest: { release: "1.21.9" }, versions: opts.versions ?? [] });
      }
      if (u.includes(".json")) {
        return jsonRes({ downloads: { server: opts.serverDownload ?? null } });
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    }) as any
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveVanillaServerJar", () => {
  it("resolves the official server download and normalizes the checksum", async () => {
    stubPistonMeta({
      versions: [{ id: "1.21.1", url: "https://piston-meta.mojang.com/v1/objects/abc/1.21.1.json", type: "release" }],
      serverDownload: { url: "https://piston-data.mojang.com/v1/objects/def/server.jar", sha1: "ABCDEF123" },
    });
    const jar = await resolveVanillaServerJar("1.21.1");
    expect(jar.url).toBe("https://piston-data.mojang.com/v1/objects/def/server.jar");
    expect(jar.sha1).toBe("abcdef123");
  });

  it("rejects a version Mojang doesn't know", async () => {
    stubPistonMeta({ versions: [{ id: "1.21.9", url: "https://x/1.21.9.json", type: "release" }] });
    await expect(resolveVanillaServerJar("9.9.9")).rejects.toThrow(/isn't a known Mojang release/);
  });

  it("rejects a version with no server download published", async () => {
    stubPistonMeta({
      versions: [{ id: "25w14a", url: "https://x/25w14a.json", type: "snapshot" }],
      serverDownload: null,
    });
    await expect(resolveVanillaServerJar("25w14a")).rejects.toThrow(/publishes no server download/);
  });
});

describe("applyVanillaServerSwap", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mc-jar-swap-"));
    currentBytes = Buffer.from("jar-bytes");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("stages, checksum-verifies, and swaps the jar in", async () => {
    const sha1 = createHash("sha1").update(currentBytes).digest("hex");
    await applyVanillaServerSwap({ serverRoot: root, jar: { url: "https://x/server.jar", sha1, size: null } });
    expect(fs.readFileSync(path.join(root, "server.jar"), "utf8")).toBe("jar-bytes");
    expect(fs.existsSync(path.join(root, ".server.jar.staging"))).toBe(false);
  });

  it("refuses a checksum mismatch and leaves the old jar in place", async () => {
    fs.writeFileSync(path.join(root, "server.jar"), "old-jar");
    await expect(
      applyVanillaServerSwap({ serverRoot: root, jar: { url: "https://x/server.jar", sha1: "deadbeef", size: null } })
    ).rejects.toThrow(/checksum/);
    expect(fs.readFileSync(path.join(root, "server.jar"), "utf8")).toBe("old-jar");
    expect(fs.existsSync(path.join(root, ".server.jar.staging"))).toBe(false);
  });
});
