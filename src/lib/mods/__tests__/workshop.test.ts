import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";

/**
 * Steam Workshop: Web API search client, SteamCMD item download, mod.info
 * derivation, and the Zomboid installer's auto-derive path. Fetch and
 * process spawning are DI'd — no network, no SteamCMD in tests.
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
  searchWorkshop, getWorkshopDetails, resolveAuthorNames, workshopWebsiteUrl,
} from "@/lib/mods/workshop";
import { downloadWorkshopItem, deriveZomboidModIds } from "@/lib/mods/workshopDownload";
import { installZomboidWorkshopMod } from "@/lib/mods/installers";

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function queryFile(id: string, extra: Record<string, unknown> = {}) {
  return {
    publishedfileid: id,
    title: `Mod ${id}`,
    creator: "76561198000000001",
    file_description: "desc",
    time_updated: "1730000000",
    lifetime_subscriptions: "12000",
    preview_url: `https://steam/${id}.jpg`,
    tags: [{ tag: "Build 42" }],
    file_size: "1024",
    banned: 0,
    ...extra,
  };
}

describe("searchWorkshop", () => {
  const page1 = { response: { publishedfiledetails: [queryFile("1"), queryFile("2", { banned: 1 })], next_cursor: "C2" } };
  const page2 = { response: { publishedfiledetails: [queryFile("3")], next_cursor: undefined } };

  it("text-searches with query_type 9, walks the cursor chain, drops banned items", async () => {
    const calls: URL[] = [];
    const fetchImpl = (async (input: any) => {
      calls.push(new URL(typeof input === "string" ? input : input.url));
      return jsonRes(calls.length === 1 ? page1 : page2);
    }) as any;

    const items = await searchWorkshop({ query: "common sense", game: "ZOMBOID", deps: { fetchImpl, apiKey: "k" } });

    expect(calls).toHaveLength(2);
    expect(calls[0].pathname).toBe("/IPublishedFileService/QueryFiles/v1/");
    expect(calls[0].searchParams.get("query_type")).toBe("9");
    expect(calls[0].searchParams.get("search_text")).toBe("common sense");
    expect(calls[0].searchParams.get("appid")).toBe("108600");
    expect(calls[0].searchParams.get("cursor")).toBe("*");
    expect(calls[1].searchParams.get("cursor")).toBe("C2");

    expect(items.map((i) => i.workshopId)).toEqual(["1", "3"]);
    expect(items[0]).toMatchObject({
      title: "Mod 1",
      authorSteamId: "76561198000000001",
      description: "desc",
      subscriptions: 12000,
      timeUpdated: new Date(1730000000 * 1000).toISOString(),
      tags: ["Build 42"],
    });
  });

  it("serves repeated pages for the same query from the cursor cache", async () => {
    let calls = 0;
    const fullPage = {
      response: {
        publishedfiledetails: Array.from({ length: 50 }, (_, i) => queryFile(String(i + 1))),
        next_cursor: "C2",
      },
    };
    const lastPage = {
      response: {
        publishedfiledetails: Array.from({ length: 10 }, (_, i) => queryFile(String(i + 51))),
        next_cursor: undefined,
      },
    };
    const fetchImpl = (async () => {
      calls++;
      return jsonRes(calls === 1 ? fullPage : lastPage);
    }) as any;

    const page = await searchWorkshop({ query: "guns", game: "ZOMBOID", deps: { fetchImpl, apiKey: "k" } });
    expect(calls).toBe(1);
    expect(page).toHaveLength(50);

    // Same window again: served entirely from the cache.
    const again = await searchWorkshop({ query: "guns", game: "ZOMBOID", offset: 0, deps: { fetchImpl, apiKey: "k" } });
    expect(calls).toBe(1);
    expect(again).toHaveLength(50);

    // Next offset walks the chain forward instead of refetching from "*".
    const next = await searchWorkshop({ query: "guns", game: "ZOMBOID", offset: 50, deps: { fetchImpl, apiKey: "k" } });
    expect(calls).toBe(2);
    expect(next.map((i) => i.workshopId)).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 51))
    );
  });

  it("throws without an API key and for games without a Workshop strategy", async () => {
    await expect(
      searchWorkshop({ query: "x", game: "ZOMBOID", deps: { apiKey: "" } })
    ).rejects.toThrow("STEAM_API_KEY is not configured");
    await expect(
      searchWorkshop({ query: "x", game: "MINECRAFT", deps: { apiKey: "k" } })
    ).rejects.toThrow("No Steam Workshop AppID");
  });
});

describe("getWorkshopDetails / resolveAuthorNames", () => {
  it("batches publishedfileids and keeps result==1 entries only", async () => {
    let body: URLSearchParams | undefined;
    const fetchImpl = (async (_url: any, init: any) => {
      body = new URLSearchParams(init.body);
      return jsonRes({
        response: {
          publishedfiledetails: [
            { result: 1, publishedfileid: "111", title: "Kept", time_updated: "1730000000" },
            { result: 9, publishedfileid: "222", title: "Gone" },
          ],
        },
      });
    }) as any;

    const details = await getWorkshopDetails(["111", "222", "111"], { fetchImpl });

    expect(body?.get("itemcount")).toBe("2");
    expect(body?.get("publishedfileids[0]")).toBe("111");
    expect(details.size).toBe(1);
    expect(details.get("111")).toMatchObject({
      title: "Kept",
      timeUpdated: new Date(1730000000 * 1000).toISOString(),
    });
  });

  it("resolves author display names best-effort (swallows errors)", async () => {
    const ok = (async () =>
      jsonRes({ response: { players: [{ steamid: "sid1", personaname: "Braven" }] } } as any)) as any;
    expect(await resolveAuthorNames(["sid1"], { fetchImpl: ok, apiKey: "k" })).toEqual({ sid1: "Braven" });
    const bad = (async () => jsonRes({}, 500)) as any;
    expect(await resolveAuthorNames(["sid2"], { fetchImpl: bad, apiKey: "k" })).toEqual({});
  });
});

describe("workshopWebsiteUrl", () => {
  it("links the sharedfiles page", () => {
    expect(workshopWebsiteUrl("2875848298")).toContain("id=2875848298");
  });
});

describe("deriveZomboidModIds", () => {
  let tmp = "";
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-wsdownload-"));
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function makeItem(name: string, mods: Record<string, string>) {
    const contentDir = path.join(tmp, name);
    for (const [rel, content] of Object.entries(mods)) {
      fs.mkdirSync(path.join(contentDir, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(contentDir, rel), content);
    }
    return contentDir;
  }

  it("derives the id from mod.info, deduping version folders (real Common Sense layout)", () => {
    // Mirrors a live SteamCMD download of workshop 2875848298: the ini id
    // (BB_CommonSense) differs from the folder name (CommonSense), and the
    // item ships both a build-41 root and a 42.0 variant of the same mod.
    const dir = makeItem("common-sense", {
      "mods/CommonSense/mod.info": "name=Common Sense\nid=BB_CommonSense\nposter=poster.png\n",
      "mods/CommonSense/42.0/mod.info": "name=Common Sense\nid=BB_CommonSense\nposter=poster.png\n",
    });
    expect(deriveZomboidModIds(dir)).toEqual([{ modId: "BB_CommonSense", name: "Common Sense" }]);
  });

  it("collects every mod folder, falling back to the folder name when id= is missing", () => {
    const dir = makeItem("multi", {
      "mods/ModOne/mod.info": "name=One\nid=MO\n",
      "mods/ModTwo/mod.info": "name=Two\n",
    });
    expect(deriveZomboidModIds(dir)).toEqual([
      { modId: "MO", name: "One" },
      { modId: "ModTwo", name: "Two" },
    ]);
  });

  it("refuses items without any mod.info", () => {
    const dir = makeItem("notamod", { "readme.txt": "hello" });
    expect(() => deriveZomboidModIds(dir)).toThrow("no mod.info");
  });
});

function fakeChild(script: { output?: string; exitCode: number; beforeClose?: () => void }) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  queueMicrotask(() => {
    if (script.output) child.stdout.emit("data", Buffer.from(script.output));
    script.beforeClose?.();
    child.emit("close", script.exitCode);
  });
  return child;
}

describe("downloadWorkshopItem", () => {
  let tmp = "";
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-wscmd-"));
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const args = {
    appId: 108600,
    workshopId: "2875848298",
    installDir: path.join(tmp, "zomboid-server"),
  };

  it("runs anonymous SteamCMD and returns the item content dir", async () => {
    let receivedArgs: string[] = [];
    const contentDir = path.join(args.installDir, "steamapps", "workshop", "content", "108600", args.workshopId);
    const spawnImpl = ((exe: string, cmdArgs: string[]) => {
      receivedArgs = cmdArgs;
      return fakeChild({
        output: "Success. Downloaded item 2875848298 to",
        exitCode: 0,
        beforeClose: () => fs.mkdirSync(contentDir, { recursive: true }),
      }) as any;
    }) as any;

    const logs: string[] = [];
    const result = await downloadWorkshopItem({ ...args, onLog: (m) => logs.push(m), deps: { steamcmdExe: "steamcmd", spawnImpl } });

    expect(receivedArgs).toEqual([
      "+force_install_dir", args.installDir,
      "+login", "anonymous",
      "+workshop_download_item", "108600", "2875848298",
      "+quit",
    ]);
    expect(result).toBe(contentDir);
    expect(logs.join("\n")).toContain("Success. Downloaded item");
  });

  it("surfaces SteamCMD failures with the output tail", async () => {
    const spawnImpl = (() =>
      fakeChild({ output: "ERROR! Download item 2875848298 failed (Timeout).", exitCode: 7 }) as any) as any;

    await expect(
      downloadWorkshopItem({ ...args, deps: { steamcmdExe: "steamcmd", spawnImpl } })
    ).rejects.toThrow(/exited with code 7[\s\S]*ERROR!/);
  });

  it("refuses a 'successful' run whose content dir does not exist", async () => {
    const spawnImpl = (() => fakeChild({ exitCode: 0 }) as any) as any;
    await expect(
      downloadWorkshopItem({
        ...args,
        installDir: path.join(tmp, "fresh-zomboid-server"),
        deps: { steamcmdExe: "steamcmd", spawnImpl },
      })
    ).rejects.toThrow("content was not found");
  });
});

describe("installZomboidWorkshopMod (auto-derive path)", () => {
  let tmp = "";
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-wsinstall-"));
    dbBag.upserts = [];
  });
  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const iniPath = (serverRoot: string) =>
    path.join(serverRoot, "zomboid-server", "zomboid-data", "Server", "servertest.ini");

  it("downloads the item, derives the mod ids, writes the ini and the row", async () => {
    const serverRoot = path.join(tmp, "srv");
    fs.mkdirSync(path.join(serverRoot, "zomboid-server"), { recursive: true });
    const contentDir = path.join(serverRoot, "zomboid-server", "steamapps", "workshop", "content", "108600", "111");
    const downloadWorkshop = (async () => {
      fs.mkdirSync(path.join(contentDir, "mods", "ModOne"), { recursive: true });
      fs.writeFileSync(path.join(contentDir, "mods", "ModOne", "mod.info"), "name=One\nid=MO\n");
      fs.mkdirSync(path.join(contentDir, "mods", "ModTwo"), { recursive: true });
      fs.writeFileSync(path.join(contentDir, "mods", "ModTwo", "mod.info"), "name=Two\nid=MT\n");
      return contentDir;
    }) as any;

    await installZomboidWorkshopMod({
      serverId: "s1", serverRoot, workshopId: "111", version: "2025-11-08T00:00:00.000Z",
      deps: { downloadWorkshop },
    });

    const ini = fs.readFileSync(iniPath(serverRoot), "utf-8");
    expect(ini).toContain("WorkshopItems=111");
    expect(ini).toContain("Mods=MO;MT");
    expect(dbBag.upserts).toHaveLength(1);
    expect(dbBag.upserts[0].create).toMatchObject({
      provider: "workshop",
      packageId: "111",
      workshopModId: "MO;MT",
      name: "One",
      version: "2025-11-08T00:00:00.000Z",
    });
  });

  it("refuses to download when the Zomboid server is not installed", async () => {
    const serverRoot = path.join(tmp, "empty");
    fs.mkdirSync(serverRoot, { recursive: true });
    await expect(
      installZomboidWorkshopMod({
        serverId: "s1", serverRoot, workshopId: "111",
        deps: { downloadWorkshop: (async () => "") as any },
      })
    ).rejects.toThrow("not installed yet");
  });

  it("keeps the supplied modId fast path (no download)", async () => {
    const serverRoot = path.join(tmp, "srv2");
    fs.mkdirSync(path.join(serverRoot, "zomboid-server"), { recursive: true });
    const downloadWorkshop = (async () => {
      throw new Error("must not download");
    }) as any;

    await installZomboidWorkshopMod({
      serverId: "s1", serverRoot, workshopId: "2875848298", modId: "BB_CommonSense", name: "Common Sense",
      deps: { downloadWorkshop },
    });

    const ini = fs.readFileSync(iniPath(serverRoot), "utf-8");
    expect(ini).toContain("Mods=BB_CommonSense");
    expect(dbBag.upserts[0].create).toMatchObject({ workshopModId: "BB_CommonSense", version: "Workshop" });
  });
});
