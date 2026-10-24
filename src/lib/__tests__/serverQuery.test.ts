import { describe, it, expect, vi } from "vitest";
import { buildQueryContext, resolveQueryPort, queryGameServer } from "../serverQuery";
import type { GameDefinitionSpec } from "../definitions/types";

/**
 * The shared gamedig query used by the authed /query route and the public
 * status page. Both must answer with the same honest truth: counts only,
 * offline when the game doesn't answer.
 */

const baseServer = {
  status: "RUNNING",
  port: 25565,
  name: "My Server",
  ramAllocation: 4,
  password: "secret",
  paramValues: JSON.stringify({ levelName: "world" }),
};

const spec = (over: Partial<GameDefinitionSpec> = {}): GameDefinitionSpec =>
  ({ queryType: "minecraft", ...over }) as GameDefinitionSpec;

describe("queryGameServer", () => {
  it("reports offline for a server that isn't running (never queries)", async () => {
    const dig = vi.fn();
    const result = await queryGameServer({ ...baseServer, status: "STOPPED" }, spec(), { dig });
    expect(result).toEqual({ status: "offline", error: "Server is not running" });
    expect(dig).not.toHaveBeenCalled();
  });

  it("reports unsupported games instead of pretending", async () => {
    const dig = vi.fn();
    const result = await queryGameServer(baseServer, spec({ queryType: undefined }), { dig });
    expect(result.status).toBe("unsupported");
    expect(dig).not.toHaveBeenCalled();
  });

  it("maps a successful query to counts and the player list", async () => {
    const dig = vi.fn().mockResolvedValue({
      name: "My Server",
      players: [{ name: "a" }, { name: "b" }, { name: "c" }],
      maxplayers: 20,
    });
    const result = await queryGameServer(baseServer, spec(), { dig });
    expect(result).toEqual({
      status: "online",
      name: "My Server",
      players: 3,
      maxplayers: 20,
      playerList: [{ name: "a" }, { name: "b" }, { name: "c" }],
    });
    expect(dig).toHaveBeenCalledWith({ type: "minecraft", host: "127.0.0.1", port: 25565 });
  });

  it("maps a query failure to offline with the game's error", async () => {
    const dig = vi.fn().mockRejectedValue(new Error("timed out"));
    const result = await queryGameServer(baseServer, spec(), { dig });
    expect(result).toEqual({ status: "offline", error: "timed out" });
  });
});

describe("resolveQueryPort + buildQueryContext", () => {
  it("falls back to the server port when the spec has no queryPort template", () => {
    const ctx = buildQueryContext(baseServer);
    expect(resolveQueryPort(spec({ queryPort: undefined }), ctx, 25565)).toBe(25565);
  });

  it("renders queryPort templates against param values", () => {
    const server = { ...baseServer, paramValues: JSON.stringify({ queryPort: "27015" }) };
    const ctx = buildQueryContext(server);
    expect(resolveQueryPort(spec({ queryPort: "{queryPort}" }), ctx, 25565)).toBe(27015);
  });

  it("builds the template context from server fields", () => {
    const ctx = buildQueryContext(baseServer);
    expect(ctx.name).toBe("My Server");
    expect(ctx.nameSanitized).toBe("My_Server");
    expect(ctx.password).toBe("secret");
    expect(ctx.levelName).toBe("world");
  });

  it("tolerates missing paramValues and password", () => {
    const ctx = buildQueryContext({ ...baseServer, paramValues: null, password: null });
    expect(ctx.password).toBe("");
    expect(ctx.port).toBe(25565);
  });
});
