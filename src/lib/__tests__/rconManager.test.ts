import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The live-roster chain behind /api/servers/[id]/rcon/players: RCON when the
 * server has rconPort/rconPassword configured (names + kick/ban/broadcast all
 * work through it), the shared gamedig query otherwise. Both rcon-client and
 * gamedig are module mocks — no test here ever touches a real server.
 */

const bag = vi.hoisted(() => ({
  serverRow: null as any,
  definitionSpec: null as string | null,
  rconSend: vi.fn(),
  dig: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    server: {
      findUnique: async () => bag.serverRow,
    },
    gameDefinition: {
      findUnique: async () => null,
      findFirst: async () => (bag.definitionSpec ? { id: "def1", spec: bag.definitionSpec } : null),
    },
  },
}));

vi.mock("rcon-client", () => ({
  Rcon: {
    connect: vi.fn(async () => ({
      authenticated: true,
      send: bag.rconSend,
      on: vi.fn(),
    })),
  },
}));

vi.mock("gamedig", () => ({
  GameDig: { query: bag.dig },
}));

import { rconManager } from "../rconManager";
import { Rcon } from "rcon-client";

// A minimal spec exercising the fallback path — valheim-style, query port is
// join port + 1 (the same convention the builtin definitions use).
const VALHEIM_SPEC = JSON.stringify({
  install: { appId: "896660", installSubDir: "valheim-server", checkFile: "x", requiredDiskGB: 2 },
  launch: { executable: "valheim_server.exe", args: [] },
  defaultPort: 2456,
  params: [],
  configFiles: [],
  ports: [],
  queryType: "valheim",
  queryPort: "{port}+1",
});

const baseServer = (id: string) => ({
  id,
  game: "MINECRAFT",
  status: "RUNNING",
  definitionId: null,
  port: 25565,
  name: "My Server",
  ramAllocation: 4,
  password: null,
  paramValues: null,
  runnerType: null,
  nodeId: null,
});

beforeEach(() => {
  vi.mocked(Rcon.connect).mockClear();
  bag.dig.mockReset();
  bag.rconSend.mockReset();
  bag.serverRow = null;
  bag.definitionSpec = null;
});

describe("rconManager.getLivePlayers", () => {
  it("configured RCON answers and gamedig is never consulted", async () => {
    bag.serverRow = { ...baseServer("srv-rcon"), rconPort: 25575, rconPassword: "sekret" };
    bag.definitionSpec = VALHEIM_SPEC; // fallback would be available — must not run
    bag.rconSend.mockResolvedValue("There are 2 of a max of 20 players online: Notch, Jeb");

    const result = await rconManager.getLivePlayers(bag.serverRow);

    expect(result).toEqual({ players: ["Notch", "Jeb"], source: "rcon" });
    expect(Rcon.connect).toHaveBeenCalledWith(
      expect.objectContaining({ port: 25575, password: "sekret" })
    );
    expect(bag.dig).not.toHaveBeenCalled();
  });

  it("unconfigured RCON falls back to the gamedig query (right game + port)", async () => {
    bag.serverRow = { ...baseServer("srv-no-rcon"), port: 2456, game: "VALHEIM", rconPort: null, rconPassword: null };
    bag.definitionSpec = VALHEIM_SPEC;
    bag.dig.mockResolvedValue({
      name: "x",
      players: [{ name: "A" }, { name: null }, { name: "" }, {}],
      maxplayers: 10,
    });

    const result = await rconManager.getLivePlayers(bag.serverRow);

    // Join port 2456 → query port 2457; unnamed gamedig players dropped.
    expect(bag.dig).toHaveBeenCalledWith({ type: "valheim", host: "127.0.0.1", port: 2457 });
    expect(result).toEqual({ players: ["A"], source: "query" });
    expect(Rcon.connect).not.toHaveBeenCalled();
  });

  it("RCON configured but unreachable also falls back to the query", async () => {
    vi.mocked(Rcon.connect).mockRejectedValueOnce(new Error("connection refused"));
    bag.serverRow = { ...baseServer("srv-dead-rcon"), port: 2456, game: "VALHEIM", rconPort: 25575, rconPassword: "sekret" };
    bag.definitionSpec = VALHEIM_SPEC;
    bag.dig.mockResolvedValue({ name: "x", players: [{ name: "B" }], maxplayers: 10 });

    const result = await rconManager.getLivePlayers(bag.serverRow);

    expect(Rcon.connect).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ players: ["B"], source: "query" });
  });

  it("no RCON and no query protocol → honest empty roster", async () => {
    bag.serverRow = { ...baseServer("srv-plain"), rconPort: null, rconPassword: null };
    bag.definitionSpec = null; // game has no queryType

    const result = await rconManager.getLivePlayers(bag.serverRow);

    expect(result).toEqual({ players: [], source: null });
    expect(Rcon.connect).not.toHaveBeenCalled();
    expect(bag.dig).not.toHaveBeenCalled();
  });

  it("a stopped server is never queried at all", async () => {
    bag.serverRow = { ...baseServer("srv-stopped"), status: "STOPPED", rconPort: 25575, rconPassword: "sekret" };
    bag.definitionSpec = VALHEIM_SPEC;

    const result = await rconManager.getLivePlayers(bag.serverRow);

    expect(result).toEqual({ players: [], source: null });
    expect(Rcon.connect).not.toHaveBeenCalled();
    expect(bag.dig).not.toHaveBeenCalled();
  });
});
