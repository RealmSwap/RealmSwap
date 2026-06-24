import { describe, it, expect } from "vitest";
import path from "path";
import { resolveCommand } from "../plan";

describe("resolveCommand", () => {
  it("spawns PATH commands by name", () => {
    expect(resolveCommand("/srv/x", "java", true)).toBe("java");
    expect(resolveCommand("/srv/zomboid-server", "cmd.exe", true)).toBe("cmd.exe");
  });
  it("resolves install-relative executables against installDir (no doubling for ARK)", () => {
    expect(resolveCommand("/srv/ark-server", "ShooterGame/Binaries/Win64/ShooterGameServer.exe", false))
      .toBe(path.join("/srv/ark-server", "ShooterGame/Binaries/Win64/ShooterGameServer.exe"));
    expect(resolveCommand("/srv/valheim-server", "valheim_server.exe"))
      .toBe(path.join("/srv/valheim-server", "valheim_server.exe"));
  });
});
