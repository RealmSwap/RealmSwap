import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * ARK Workshop support: GameUserSettings.ini ActiveMods= editing, the
 * installer row contract, and the honest update-path refusal. Real fs in a
 * temp dir; only the DB is mocked.
 */

const dbBag = vi.hoisted(() => ({ upserts: [] as any[] }));
vi.mock("@/lib/db", () => ({
  prisma: {
    get modInstallation() {
      return {
        upsert: async (args: any) => {
          dbBag.upserts.push(args);
          return {};
        },
      };
    },
  },
}));

import {
  addArkActiveMod, removeArkActiveMod, readArkActiveMods, arkGameUserSettingsIniPath,
} from "@/lib/mods/ark";
import { installArkWorkshopMod } from "@/lib/mods/installers";
import { resolveModUpdate, UpdateResolutionError } from "@/lib/mods/updateApply";

let tmp = "";
const iniPath = (root = tmp) => arkGameUserSettingsIniPath(path.join(root, "srv"));

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-ark-"));
  dbBag.upserts = [];
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeIni(content: string, root = tmp): string {
  const p = iniPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

describe("ActiveMods ini editing", () => {
  it("creates [ServerSettings] with ActiveMods on a fresh install", () => {
    addArkActiveMod(iniPath(), "731604991");
    const content = fs.readFileSync(iniPath(), "utf-8");
    expect(content).toBe("[ServerSettings]\nActiveMods=731604991\n");
    expect(readArkActiveMods(iniPath())).toEqual(["731604991"]);
  });

  it("appends inside [ServerSettings], preserving order and other sections", () => {
    writeIni(
      "[ServerSettings]\nActiveMods=731604991\nShowMapPlayerLocation=True\n\n[SessionSettings]\nSessionName=My ARK\n"
    );
    addArkActiveMod(iniPath(), "1404697612");
    const content = fs.readFileSync(iniPath(), "utf-8");
    expect(content).toContain("ActiveMods=731604991,1404697612");
    expect(content).toContain("ShowMapPlayerLocation=True");
    expect(content).toContain("[SessionSettings]\nSessionName=My ARK");
    // Load order = append order
    expect(readArkActiveMods(iniPath())).toEqual(["731604991", "1404697612"]);
  });

  it("is idempotent per workshop id", () => {
    addArkActiveMod(iniPath(), "731604991");
    addArkActiveMod(iniPath(), "731604991");
    expect(readArkActiveMods(iniPath())).toEqual(["731604991"]);
  });

  it("removes only the target id and preserves everything else", () => {
    writeIni(
      "[ServerSettings]\nActiveMods=731604991,1404697612,761535755\nShowMapPlayerLocation=True\n[SessionSettings]\nSessionName=x\n"
    );
    removeArkActiveMod(iniPath(), "1404697612");
    const content = fs.readFileSync(iniPath(), "utf-8");
    expect(content).toContain("ActiveMods=731604991,761535755");
    expect(content).toContain("ShowMapPlayerLocation=True");
    expect(content).toContain("SessionName=x");
  });

  it("tolerates a missing ini and a missing section", () => {
    expect(readArkActiveMods(iniPath())).toEqual([]);
    removeArkActiveMod(iniPath(), "1"); // no ini — no-op, no throw
    writeIni("[SessionSettings]\nSessionName=x\n");
    removeArkActiveMod(iniPath(), "1"); // no [ServerSettings] — no-op
    addArkActiveMod(iniPath(), "2"); // creates the section alongside existing ones
    const content = fs.readFileSync(iniPath(), "utf-8");
    expect(content).toContain("SessionName=x");
    expect(readArkActiveMods(iniPath())).toEqual(["2"]);
  });
});

describe("installArkWorkshopMod", () => {
  it("writes ActiveMods and records the row keyed on the workshop id", async () => {
    fs.mkdirSync(path.join(tmp, "srv", "ark-server"), { recursive: true });

    await installArkWorkshopMod({
      serverId: "s1", serverRoot: path.join(tmp, "srv"), workshopId: "731604991",
      name: "Structures Plus (S+)", version: "2025-11-08T00:00:00.000Z",
    });

    expect(readArkActiveMods(iniPath())).toEqual(["731604991"]);
    expect(dbBag.upserts).toHaveLength(1);
    expect(dbBag.upserts[0].create).toMatchObject({
      provider: "workshop",
      packageId: "731604991",
      name: "Structures Plus (S+)",
      version: "2025-11-08T00:00:00.000Z",
    });
    // Single id space — no workshopModId for ARK.
    expect(dbBag.upserts[0].create.workshopModId).toBeUndefined();
  });

  it("refuses when the ARK server is not installed", async () => {
    fs.mkdirSync(path.join(tmp, "empty"), { recursive: true });
    await expect(
      installArkWorkshopMod({ serverId: "s1", serverRoot: path.join(tmp, "empty"), workshopId: "731604991" })
    ).rejects.toThrow("not installed yet");
  });
});

describe("update path", () => {
  it("refuses ARK workshop updates honestly (the server auto-updates on start)", async () => {
    const err = await resolveModUpdate(
      { provider: "workshop", packageId: "731604991", version: "2025-01-01T00:00:00.000Z" },
      "ARK",
      "s1"
    ).catch((e) => e);
    expect(err).toBeInstanceOf(UpdateResolutionError);
    expect(err.message).toContain("automanagemods");
  });
});
