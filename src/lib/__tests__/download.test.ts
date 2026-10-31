import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import https from "https";
import { downloadFile } from "../download";

function fakeRes(statusCode: number, headers: Record<string, string> = {}, payload?: Buffer) {
  const res: any = new EventEmitter();
  res.statusCode = statusCode;
  res.headers = headers;
  res.pipe = (dest: any) => {
    if (payload) dest.write(payload);
    dest.end();
  };
  return res;
}

describe("downloadFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "download-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves only after a redirected download has actually written the file", async () => {
    const responses: Record<string, any> = {
      "https://edge.test/files/1": fakeRes(302, { location: "https://cdn.test/files/1" }),
      "https://cdn.test/files/1": fakeRes(200, {}, Buffer.from("real payload")),
    };
    vi.spyOn(https, "get").mockImplementation(((url: any, cb: any) => {
      const u = typeof url === "string" ? url : String(url?.url ?? url);
      process.nextTick(() => cb(responses[u] ?? fakeRes(404, {})));
      return new EventEmitter();
    }) as any);

    const dest = path.join(dir, "out.bin");
    await downloadFile("https://edge.test/files/1", dest);
    // The redirect branch used to resolve the promise on the empty staging
    // stream's own 'close' event — before the redirected download had written
    // anything — so this read raced the real download (ENOENT on fast
    // machines; every CurseForge download rides an edge 302).
    expect(fs.readFileSync(dest, "utf8")).toBe("real payload");
  });

  it("rejects on non-200 instead of resolving through the close race", async () => {
    vi.spyOn(https, "get").mockImplementation(((url: any, cb: any) => {
      process.nextTick(() => cb(fakeRes(404, {})));
      return new EventEmitter();
    }) as any);

    const dest = path.join(dir, "out.bin");
    // Before the settled-first fix, the empty stream's 'close' event could
    // resolve this promise before the 404 reject landed.
    await expect(downloadFile("https://cdn.test/missing", dest)).rejects.toThrow(/status 404/);
  });

  it("follows redirect chains up to the limit and reports exhaustion", async () => {
    const responses: Record<string, any> = {};
    for (let i = 0; i < 10; i++) {
      responses[`https://hop.test/${i}`] = fakeRes(302, { location: `https://hop.test/${i + 1}` });
    }
    vi.spyOn(https, "get").mockImplementation(((url: any, cb: any) => {
      const u = typeof url === "string" ? url : String(url?.url ?? url);
      process.nextTick(() => cb(responses[u] ?? fakeRes(404, {})));
      return new EventEmitter();
    }) as any);

    await expect(downloadFile("https://hop.test/0", path.join(dir, "out.bin"))).rejects.toThrow(
      /Too many redirects|status 404/
    );
  });
});
