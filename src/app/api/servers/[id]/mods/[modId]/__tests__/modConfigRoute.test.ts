import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The Configure modal's backend on AGENT servers: resolution runs against the
 * node's directory listing (agentListServerDir) and file contents
 * (agentReadServerFile), and saves go back through agentWriteServerFile with
 * a backup. Local behavior is covered by modRoutes.test.ts.
 */

const bag = vi.hoisted(() => ({
  access: null as any,
  mod: null as any,
  listed: [] as { name: string; isDir: boolean }[],
  readResult: { exists: true, content: null as string | null },
  reads: [] as any[],
  writes: [] as any[],
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "user1" }) }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async (_serverId: string, _userId: string, required?: string) => {
    if (required === "ADMIN" && bag.access?.requireAdmin === false) return null;
    return bag.access;
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    get modInstallation() {
      return { findUnique: async () => bag.mod };
    },
    get activityLog() {
      return { create: async () => ({}) };
    },
  },
}));
vi.mock("@/lib/appPaths", () => ({ dataRoot: () => "/unused-local-disk" }));
vi.mock("@/lib/agents/agentFiles", () => ({
  agentListServerDir: async (_serverId: string, relPath: string) => {
    bag.reads.push({ kind: "LIST", relPath });
    return bag.listed;
  },
  agentReadServerFile: async (_serverId: string, relPath: string) => {
    bag.reads.push({ kind: "READ", relPath });
    return bag.readResult;
  },
  agentWriteServerFile: async (_serverId: string, relPath: string, content: string, opts?: any) => {
    bag.writes.push({ relPath, content, opts });
  },
}));

import { GET, POST } from "../config/route";

const req = (method: "GET" | "POST", body?: object) =>
  new NextRequest("http://localhost/api/servers/srv1/mods/mod1/config", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });

const bepinexCfg = `[General]

## Setting descriptions live as comments.
# Setting type: Boolean
PresetNextDay = false

[PlantEverything]
PlantEverything.Enabled = true
`;

describe("mod config route — AGENT servers", () => {
  beforeEach(() => {
    bag.access = {
      requireAdmin: true,
      server: { id: "srv1", game: "VALHEIM", runnerType: "AGENT", status: "STOPPED", name: "V" },
    };
    bag.mod = { id: "mod1", serverId: "srv1", provider: "thunderstore", packageId: "Advize-PlantEverything", name: "PlantEverything" };
    bag.listed = [];
    bag.readResult = { exists: true, content: bepinexCfg };
    bag.reads = [];
    bag.writes = [];
  });

  it("GET resolves the cfg against the node's BepInEx/config listing and parses its content", async () => {
    bag.listed = [
      { name: "PlantEverything.cfg", isDir: false },
      { name: "other.cfg", isDir: false },
      { name: "plugins", isDir: true },
    ];
    const res = await GET(req("GET"), { params: { id: "srv1", modId: "mod1" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.file).toBe("PlantEverything.cfg");
    expect(data.format).toBe("cfg");
    const section = data.sections.find((s: any) => s.name === "PlantEverything");
    expect(section.properties.some((p: any) => p.key === "PlantEverything.Enabled")).toBe(true);
    expect(bag.reads).toEqual([
      { kind: "LIST", relPath: "valheim-server/BepInEx/config" },
      { kind: "READ", relPath: "valheim-server/BepInEx/config/PlantEverything.cfg" },
    ]);
  });

  it("GET refuses honestly when no unique cfg matches", async () => {
    bag.listed = [{ name: "unrelated.cfg", isDir: false }];
    const res = await GET(req("GET"), { params: { id: "srv1", modId: "mod1" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Couldn't determine") });
  });

  it("GET resolves Minecraft tomls by stem without jar metadata", async () => {
    bag.access = {
      requireAdmin: true,
      server: { id: "srv1", game: "MINECRAFT", runnerType: "AGENT", status: "STOPPED", name: "MC" },
    };
    bag.mod = { id: "mod1", serverId: "srv1", provider: "modrinth", packageId: "snowysprouts", name: "Snowy Sprouts" };
    bag.listed = [{ name: "snowysprouts.toml", isDir: false }];
    bag.readResult = { exists: true, content: '[flower]\ncount = 3\n' };
    const res = await GET(req("GET"), { params: { id: "srv1", modId: "mod1" } });
    const data = await res.json();
    expect(data.format).toBe("toml");
    expect(data.file).toBe("snowysprouts.toml");
    expect(data.sections[0].properties.some((p: any) => p.key === "count")).toBe(true);
  });

  it("POST serializes against the node's current content and writes back with a backup", async () => {
    bag.listed = [{ name: "PlantEverything.cfg", isDir: false }];
    const sections = [
      { name: "PlantEverything", properties: [
        { key: "PlantEverything.Enabled", value: "false", type: "Boolean", defaultValue: "true", description: "" },
      ] },
    ];
    const res = await POST(req("POST", { sections }), { params: { id: "srv1", modId: "mod1" } });
    expect(res.status).toBe(200);
    expect(bag.writes).toEqual([
      {
        relPath: "valheim-server/BepInEx/config/PlantEverything.cfg",
        content: expect.stringContaining("PlantEverything.Enabled = false"),
        opts: { backup: true },
      },
    ]);
  });

  it("POST refuses a running server", async () => {
    bag.access = {
      requireAdmin: true,
      server: { id: "srv1", game: "VALHEIM", runnerType: "AGENT", status: "RUNNING", name: "V" },
    };
    const res = await POST(req("POST", { sections: [] }), { params: { id: "srv1", modId: "mod1" } });
    expect(res.status).toBe(400);
    expect(bag.writes).toEqual([]);
  });
});
