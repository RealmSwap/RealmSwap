import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import type { GameDefinitionSpec } from "@/lib/definitions/types";

/**
 * buildAgentConfigEntries: the bridge between rendered config files and the
 * agent's data-dir-relative write surface. Two invariants guarded here:
 * 1. entries are prefixed with the install subdir — without it, every game
 *    that installs into <dataDir>/<subdir> gets its config written NEXT TO
 *    the install dir where the game never reads it.
 * 2. entries merge into existing files (raw-editor edits survive restarts),
 *    except full-overwrite strategies (enshroudedJson), matching the local
 *    runners' semantics.
 */

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { buildAgentConfigEntries } from "@/lib/runners/docker/planLaunch";
import { buildContext } from "@/lib/definitions/context";

const spec = (overrides: Partial<GameDefinitionSpec>): GameDefinitionSpec => ({
  install: { appId: "380870", installSubDir: "zomboid-server", checkFile: "x", requiredDiskGB: 1 },
  launch: { executable: "x", args: [] },
  defaultPort: 16261,
  params: [],
  configFiles: [],
  ports: [],
  ...overrides,
} as GameDefinitionSpec);

const ctxFor = (s: GameDefinitionSpec) =>
  buildContext({ name: "test-server", password: null, port: 16261, ram: 4, paramValuesJson: null, spec: s });

describe("buildAgentConfigEntries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefixes install-dir-relative paths with the container installSubDir", () => {
    const s = spec({
      configFiles: [{ path: "zomboid-data/Server/servertest.ini", strategy: "zomboidIniMerge" }],
      container: { executable: "StartServer64.sh", installSubDir: "zomboid-server" },
    });
    const entries = buildAgentConfigEntries(s, ctxFor(s), { name: "test-server", password: "pw" });
    expect(entries.length).toBe(1);
    expect(entries[0].relPath).toBe("zomboid-server/zomboid-data/Server/servertest.ini");
    // The zomboid writer merges just the Password line; merging that into the
    // node's real ini preserves every other line.
    expect(entries[0].merge).toBe(true);
    expect(entries[0].content).toContain("Password=pw");
  });

  it("marks full-overwrite strategies (enshroudedJson) as merge:false", () => {
    const s = spec({
      install: { appId: "2278520", installSubDir: "enshrouded-server", checkFile: "x", requiredDiskGB: 1 },
      configFiles: [{ path: "enshrouded_server.json", strategy: "enshroudedJson" }],
      container: { executable: "enshrouded_server.exe", installSubDir: "enshrouded-server" },
    });
    const entries = buildAgentConfigEntries(s, ctxFor(s), { name: "test-server", password: null });
    expect(entries[0].relPath).toBe("enshrouded-server/enshrouded_server.json");
    expect(entries[0].merge).toBe(false);
    expect(JSON.parse(entries[0].content).name).toBe("test-server");
  });

  it("leaves root-installed games (Minecraft) unprefixed and merge-preserving", () => {
    const s = spec({
      install: { url: "https://example.com/server.jar", fileName: "server.jar", checkFile: "server.jar" },
      configFiles: [{ path: "server.properties", strategy: "template", template: "motd=hi\n" }],
      container: { executable: "java", installSubDir: undefined },
    });
    const entries = buildAgentConfigEntries(s, ctxFor(s), { name: "test-server", password: null });
    expect(entries[0].relPath).toBe("server.properties");
    expect(entries[0].merge).toBe(true);
  });

  it("falls back to the install spec's subdir when there is no container plan", () => {
    const s = spec({
      configFiles: [{ path: "cfg/a.ini", strategy: "template", template: "a=1\n" }],
    });
    const entries = buildAgentConfigEntries(s, ctxFor(s), { name: "test-server", password: null });
    expect(entries[0].relPath).toBe("zomboid-server/cfg/a.ini");
    expect(fs.existsSync(entries[0].relPath)).toBe(false); // nothing leaked to CWD
  });
});
