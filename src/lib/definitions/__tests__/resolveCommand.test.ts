import { describe, it, expect } from "vitest";
import path from "path";
import { resolveCommand, resolveExecutablePath } from "../plan";

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

describe("resolveExecutablePath", () => {
  // Build dirs with path.join and join PATH with path.delimiter so the test runs
  // on both Windows (";", "\\") and the POSIX CI runner (":", "/"). Plain segment
  // names avoid drive-letter colons, which would collide with the POSIX delimiter.
  const binDir = path.join("opt", "jdk", "bin");
  const sysDir = path.join("opt", "sys");
  const PATH = [binDir, sysDir].join(path.delimiter);
  const PATHEXT = ".EXE;.CMD;.BAT";
  const existsIn = (paths: string[]) => (p: string) => paths.includes(p);

  it("appends PATHEXT and returns the full path of the first match", () => {
    const target = path.join(binDir, "java.EXE");
    expect(resolveExecutablePath("java", PATH, PATHEXT, existsIn([target]))).toBe(target);
  });

  it("does not append PATHEXT when the name already has an extension", () => {
    const target = path.join(sysDir, "cmd.exe");
    expect(resolveExecutablePath("cmd.exe", PATH, PATHEXT, existsIn([target]))).toBe(target);
  });

  it("falls back to the bare name when nothing is found", () => {
    expect(resolveExecutablePath("java", PATH, PATHEXT, () => false)).toBe("java");
  });

  it("returns an explicit path unchanged without scanning", () => {
    const explicit = path.join(binDir, "java.exe");
    expect(resolveExecutablePath(explicit, PATH, PATHEXT, () => false)).toBe(explicit);
  });
});
