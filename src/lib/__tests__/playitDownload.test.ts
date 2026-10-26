import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";

/**
 * downloadPlayitBinary against a scripted HTTPS chain. GitHub's
 * `releases/latest/download/<asset>` answers 302 → the versioned URL answers
 * 302 again → the signed CDN URL answers 200. The downloader used to follow
 * exactly one hop and report the second 302 as "Download failed with HTTP
 * 302 for <first url>" — the error Cody hit on his Windows box.
 */

const hoisted = vi.hoisted(() => ({
  tmpDir: `${process.env.TMPDIR || "/tmp"}/realmswap-playit-dl-${process.pid}-${Date.now()}`,
  requests: [] as string[],
  // One factory per expected request, consumed in order.
  scripted: [] as Array<() => unknown>,
}));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/appPaths", () => ({ dataRoot: () => hoisted.tmpDir }));
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  // The release table has no macOS asset — resolve as the Windows host the
  // bug was reported from.
  return { ...actual, platform: () => "win32", arch: () => "x64" };
});
vi.mock("https", () => ({
  get: (url: string, cb: (res: unknown) => void) => {
    hoisted.requests.push(url);
    const next = hoisted.scripted.shift();
    if (!next) throw new Error(`Unexpected request: ${url}`);
    const res = next();
    queueMicrotask(() => cb(res));
    const req = { setTimeout: () => req, on: () => req, destroy: () => req };
    return req;
  },
}));

import { downloadPlayitBinary, playitReleaseFor } from "@/lib/tunnels";

function response(statusCode: number, headers: Record<string, string> = {}, body = ""): () => unknown {
  return () => {
    const res = Readable.from([Buffer.from(body)]) as Readable & {
      statusCode: number;
      headers: Record<string, string>;
    };
    res.statusCode = statusCode;
    res.headers = headers;
    return res;
  };
}

const RELEASE_URL = playitReleaseFor("win32", "x64")!.url;
const VERSIONED_URL = "https://github.com/playit-cloud/playit-agent/releases/download/v1.0.10/playit-windows-x86_64.exe";
const CDN_URL = "https://release-assets.githubusercontent.com/github-production-release-asset/445695426/signed?sig=abc";
const BIN_DIR = path.join(hoisted.tmpDir, "bin");
const BIN_PATH = path.join(BIN_DIR, "playit.exe");

describe("downloadPlayitBinary", () => {
  beforeEach(() => {
    fs.rmSync(hoisted.tmpDir, { recursive: true, force: true });
    hoisted.requests.length = 0;
    hoisted.scripted.length = 0;
  });

  it("follows GitHub's two-hop redirect chain and lands the binary", async () => {
    hoisted.scripted.push(
      response(302, { location: VERSIONED_URL }),
      response(302, { location: CDN_URL }),
      response(200, {}, "MZ-fake-playit"),
    );

    await expect(downloadPlayitBinary()).resolves.toBe(BIN_PATH);

    expect(hoisted.requests).toEqual([RELEASE_URL, VERSIONED_URL, CDN_URL]);
    expect(fs.readFileSync(BIN_PATH, "utf8")).toBe("MZ-fake-playit");
    expect(fs.existsSync(`${BIN_PATH}.part`)).toBe(false);
  });

  it("resolves a relative Location against the URL that issued it", async () => {
    hoisted.scripted.push(
      response(302, { location: "/playit-cloud/playit-agent/releases/download/v1.0.10/playit-windows-x86_64.exe" }),
      response(200, {}, "bin"),
    );

    await downloadPlayitBinary();

    expect(hoisted.requests[1]).toBe(VERSIONED_URL);
  });

  it("names the hop that actually failed, not the first URL", async () => {
    hoisted.scripted.push(
      response(302, { location: VERSIONED_URL }),
      response(404),
    );

    await expect(downloadPlayitBinary()).rejects.toThrow(`Download failed with HTTP 404 for ${VERSIONED_URL}.`);
    expect(fs.existsSync(BIN_PATH)).toBe(false);
    expect(fs.existsSync(`${BIN_PATH}.part`)).toBe(false);
  });

  it("refuses a redirect loop instead of following it forever", async () => {
    for (let i = 0; i < 7; i++) {
      hoisted.scripted.push(response(302, { location: `${VERSIONED_URL}?hop=${i}` }));
    }

    await expect(downloadPlayitBinary()).rejects.toThrow(/exceeded 5 redirects/);
    expect(hoisted.requests.length).toBe(6);
    expect(fs.existsSync(BIN_PATH)).toBe(false);
  });

  it("rejects a redirect with no Location header", async () => {
    hoisted.scripted.push(response(302));

    await expect(downloadPlayitBinary()).rejects.toThrow(/no target location/);
  });

  it("reuses an already-downloaded binary without touching the network", async () => {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    fs.writeFileSync(BIN_PATH, "cached");

    await expect(downloadPlayitBinary()).resolves.toBe(BIN_PATH);
    expect(hoisted.requests).toEqual([]);
  });
});
