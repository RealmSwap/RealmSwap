import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  buildDefinitionFile,
  readDefinitionFile,
  DEFINITION_FILE_FORMAT,
  DEFINITION_FILE_MAX_BYTES,
} from "@/lib/definitions/definitionFile";

// Sharing a game definition as a file: export only what an import would
// accept, and never add an imported definition before the user has seen what
// it runs.

const bag = {
  definitions: [] as any[],
  user: { id: "user-1", role: "USER" } as { id: string; role: string } | null,
};

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => bag.user }));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameDefinition: {
      findFirst: async ({ where }: any) =>
        bag.definitions.find((d) => d.id === where.id && d.ownerId === where.ownerId) ?? null,
      findMany: async ({ where }: any) => bag.definitions.filter((d) => d.ownerId === where.ownerId),
      create: async ({ data }: any) => {
        const row = { id: `def-${bag.definitions.length + 1}`, ...data };
        bag.definitions.push(row);
        return row;
      },
    },
  },
}));

import { GET as exportRoute } from "../[id]/export/route";
import { POST as importRoute } from "../import/route";

const spec = () => ({
  install: { appId: "896660", installSubDir: "cool", checkFile: "cool_server.exe", requiredDiskGB: 2 },
  launch: { executable: "cool_server.exe", args: ["-port", "{port}"] },
  defaultPort: 2456,
  params: [],
  configFiles: [],
  ports: [{ protocol: "UDP", port: "{port}" }],
});

const stored = (over: Record<string, any> = {}) => ({
  id: "def-mine",
  slug: "cool-game",
  ownerId: "user-1",
  displayName: "Cool Game",
  description: "A cool game",
  icon: "🧊",
  recommendedRamGB: 6,
  installMethod: "STEAMCMD",
  spec: JSON.stringify(spec()),
  ...over,
});

const exportDef = (id: string) =>
  exportRoute(new NextRequest(`http://localhost/api/definitions/${id}/export`), { params: Promise.resolve({ id }) });

const importFile = (body: unknown) =>
  importRoute(
    new NextRequest("http://localhost/api/definitions/import", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  bag.definitions = [stored()];
  bag.user = { id: "user-1", role: "USER" };
});

describe("definition files (lib)", () => {
  it("a file built from a stored definition reads back as the same definition", () => {
    const built = buildDefinitionFile(stored());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.file.format).toBe(DEFINITION_FILE_FORMAT);
    const read = readDefinitionFile(JSON.parse(JSON.stringify(built.file)));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read).toMatchObject({ displayName: "Cool Game", icon: "🧊", recommendedRamGB: 6, requiredDiskGB: 2, installMethod: "STEAMCMD" });
    expect(read.spec).toEqual(built.file.definition.spec);
  });

  it("refuses to build a file for script-based or PATH-program definitions", () => {
    expect(buildDefinitionFile(stored({ installMethod: "CUSTOM_SCRIPT" })).ok).toBe(false);
    const pathExe = stored({ spec: JSON.stringify({ ...spec(), launch: { executable: "cmd.exe", executableOnPath: true, args: [] } }) });
    const built = buildDefinitionFile(pathExe);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.errors.join(" ")).toMatch(/system PATH/);
  });

  it("refuses files of another format or a newer version, saying which", () => {
    const res1 = readDefinitionFile({ format: "something-else", version: 1, definition: {} });
    expect(res1.ok ? "" : res1.errors[0]).toMatch(/not a RealmSwap game definition/);
    const res2 = readDefinitionFile({ format: DEFINITION_FILE_FORMAT, version: 2, definition: { displayName: "X", spec: spec() } });
    expect(res2.ok ? "" : res2.errors[0]).toMatch(/Update RealmSwap/);
    expect(readDefinitionFile(null).ok).toBe(false);
    expect(readDefinitionFile([]).ok).toBe(false);
  });

  it("falls back to safe defaults for odd metadata instead of trusting it", () => {
    const read = readDefinitionFile({
      format: DEFINITION_FILE_FORMAT,
      version: 1,
      definition: { displayName: "  Odd  ", icon: "x".repeat(40), recommendedRamGB: 99999, description: 5, spec: spec() },
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read).toMatchObject({ displayName: "Odd", icon: "🎮", recommendedRamGB: 4, description: "" });
  });
});

describe("GET /api/definitions/[id]/export", () => {
  it("downloads the caller's own definition as an attachment", async () => {
    const res = await exportDef("def-mine");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="cool-game.realmswap-game.json"');
    const file = await res.json();
    expect(file).toMatchObject({ format: DEFINITION_FILE_FORMAT, version: 1, definition: { displayName: "Cool Game" } });
  });

  it("404s for someone else's definition and for built-ins", async () => {
    bag.definitions.push(stored({ id: "def-theirs", ownerId: "someone-else" }), stored({ id: "def-builtin", ownerId: null }));
    expect((await exportDef("def-theirs")).status).toBe(404);
    expect((await exportDef("def-builtin")).status).toBe(404);
  });

  it("explains why a script-based definition can't be exported", async () => {
    bag.definitions = [stored({ installMethod: "CUSTOM_SCRIPT" })];
    const res = await exportDef("def-mine");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/can't be shared/);
  });

  it("requires a session", async () => {
    bag.user = null;
    expect((await exportDef("def-mine")).status).toBe(401);
  });
});

describe("POST /api/definitions/import", () => {
  const file = (over: Record<string, any> = {}) => ({
    format: DEFINITION_FILE_FORMAT,
    version: 1,
    definition: { displayName: "Cool Game", description: "A cool game", icon: "🧊", recommendedRamGB: 6, spec: spec(), ...over },
  });

  it("previews without writing anything", async () => {
    const res = await importFile({ file: file() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toMatchObject({
      displayName: "Cool Game",
      definition: { source: "Steam app 896660", executable: "cool_server.exe", args: ["-port", "{port}"] },
    });
    expect(bag.definitions).toHaveLength(1);
  });

  it("only an explicit confirm: true creates the definition", async () => {
    for (const confirm of ["true", 1, {}]) {
      expect((await importFile({ file: file(), confirm })).status).toBe(200);
    }
    expect(bag.definitions).toHaveLength(1);

    const res = await importFile({ file: file(), confirm: true });
    expect(res.status).toBe(201);
    const created = bag.definitions[1];
    // The name collides with the caller's existing "cool-game", so the slug is uniquified.
    expect(created).toMatchObject({ slug: "cool-game-2", ownerId: "user-1", installMethod: "STEAMCMD", isBuiltIn: false, requiredDiskGB: 2 });
    expect(JSON.parse(created.spec).launch.executable).toBe("cool_server.exe");
  });

  it("refuses a file whose definition fails the gate, even with confirm", async () => {
    const hostile = file({ spec: { ...spec(), launch: { executable: "powershell.exe", executableOnPath: true, args: ["-Command", "x"] } } });
    const res = await importFile({ file: hostile, confirm: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/system PATH/);
    expect(bag.definitions).toHaveLength(1);
  });

  it("refuses script-based files, oversized bodies, and non-JSON", async () => {
    const scripted = file({ spec: { ...spec(), launch: { executable: "x", args: [], launchScript: "calc" } } });
    expect((await importFile({ file: scripted, confirm: true })).status).toBe(400);
    expect((await importFile("x".repeat(DEFINITION_FILE_MAX_BYTES + 1))).status).toBe(413);
    expect((await importFile("{not json")).status).toBe(400);
    expect((await importFile({})).status).toBe(400);
    expect(bag.definitions).toHaveLength(1);
  });

  it("requires a session", async () => {
    bag.user = null;
    expect((await importFile({ file: file(), confirm: true })).status).toBe(401);
  });
});
