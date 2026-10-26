import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";

/**
 * Route-level guards for the raw config editor on AGENT servers: the editor
 * must read/write the NODE's copy of the file (via agentFiles), never the
 * dashboard's local-servers tree — and never regress the local path.
 */

const bag = vi.hoisted(() => ({
  dataRoot: "",
  isAdmin: true,
  access: null as any,
  specJson: null as string | null,
  reads: [] as any[],
  writes: [] as any[],
  readResult: { exists: true, content: null as string | null },
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "user1" }) }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async (_serverId: string, _userId: string, required?: string) => {
    if (required === "ADMIN" && !bag.isAdmin) return null;
    return bag.access;
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    get gameDefinition() {
      return {
        findUnique: async () => (bag.specJson ? { spec: bag.specJson } : null),
        findFirst: async () => (bag.specJson ? { spec: bag.specJson } : null),
      };
    },
    get activityLog() {
      return { create: async () => ({}) };
    },
  },
}));
vi.mock("@/lib/appPaths", () => ({
  dataRoot: () => bag.dataRoot,
}));
vi.mock("@/lib/agents/agentFiles", () => ({
  agentReadServerFile: async (serverId: string, relPath: string) => {
    bag.reads.push({ serverId, relPath });
    return bag.readResult;
  },
  agentWriteServerFile: async (serverId: string, relPath: string, content: string, opts?: any) => {
    bag.writes.push({ serverId, relPath, content, opts });
  },
}));

import { GET, PUT } from "../config/route";

const mcSpec = JSON.stringify({
  install: { url: "https://example.com/server.jar", fileName: "server.jar", checkFile: "server.jar" },
  launch: { executable: "java", args: [] },
  defaultPort: 25565,
  params: [],
  configFiles: [],
  ports: [],
  editableConfigPath: "server.properties",
});

const req = (method: "GET" | "PUT", body?: object) =>
  new NextRequest("http://localhost/api/servers/srv1/config", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });

describe("config editor route — AGENT servers", () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-route-test-"));
    bag.dataRoot = tmp;
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  beforeEach(() => {
    bag.access = {
      server: { id: "srv1", game: "MINECRAFT", definitionId: null, runnerType: "AGENT", status: "STOPPED", name: "MC" },
    };
    bag.specJson = mcSpec;
    bag.reads = [];
    bag.writes = [];
    bag.readResult = { exists: true, content: "motd=node copy\n" };
  });

  it("GET reads the node's file through the command queue", async () => {
    const res = await GET(req("GET"), { params: { id: "srv1" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ content: "motd=node copy\n", filename: "server.properties", editable: true });
    expect(bag.reads).toEqual([{ serverId: "srv1", relPath: "server.properties" }]);
    // The dashboard's local tree must not be touched.
    expect(fs.existsSync(path.join(tmp, "local-servers"))).toBe(false);
  });

  it("GET shows the not-yet-generated placeholder when the node has no file", async () => {
    bag.readResult = { exists: false, content: null };
    const res = await GET(req("GET"), { params: { id: "srv1" } });
    const data = await res.json();
    expect(data.content).toContain("not yet generated");
  });

  it("PUT writes through the node with the .rsbak backup flag", async () => {
    const res = await PUT(req("PUT", { content: "motd=edited\n" }), { params: { id: "srv1" } });
    expect(res.status).toBe(200);
    expect(bag.writes).toEqual([
      { serverId: "srv1", relPath: "server.properties", content: "motd=edited\n", opts: { backup: true } },
    ]);
  });

  it("PUT refuses a running server before any node round trip", async () => {
    bag.access = {
      server: { id: "srv1", game: "MINECRAFT", definitionId: null, runnerType: "AGENT", status: "RUNNING", name: "MC" },
    };
    const res = await PUT(req("PUT", { content: "x" }), { params: { id: "srv1" } });
    expect(res.status).toBe(400);
    expect(bag.writes).toEqual([]);
  });
});

describe("config editor route — local servers (no regression)", () => {
  let tmp: string;
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-route-test-"));
    bag.dataRoot = tmp;
    fs.mkdirSync(path.join(tmp, "local-servers", "srv1"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "local-servers", "srv1", "server.properties"), "motd=local\n");
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  beforeEach(() => {
    bag.access = {
      server: { id: "srv1", game: "MINECRAFT", definitionId: null, runnerType: "LOCAL", status: "STOPPED", name: "MC" },
    };
    bag.specJson = mcSpec;
    bag.reads = [];
    bag.writes = [];
  });

  it("GET/PUT stay on the dashboard disk with the .rsbak parity copy", async () => {
    const get = await GET(req("GET"), { params: { id: "srv1" } });
    expect(await get.json()).toMatchObject({ content: "motd=local\n" });
    expect(bag.reads).toEqual([]);

    const put = await PUT(req("PUT", { content: "motd=new\n" }), { params: { id: "srv1" } });
    expect(put.status).toBe(200);
    const file = path.join(tmp, "local-servers", "srv1", "server.properties");
    expect(fs.readFileSync(file, "utf-8")).toBe("motd=new\n");
    expect(fs.readFileSync(`${file}.rsbak`, "utf-8")).toBe("motd=local\n");
    expect(bag.writes).toEqual([]);
  });
});
