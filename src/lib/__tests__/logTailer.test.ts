import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { tailFile, LOG_PLACEHOLDER } from "../logTailer";

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tailer-"));
  file = path.join(dir, "server.log");
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const FAST = { tailLines: 200, pollIntervalMs: 10 };

it("snapshot returns the last N lines of an existing file", async () => {
  const lines = Array.from({ length: 250 }, (_, i) => `line ${i}`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  const ac = new AbortController();
  const gen = tailFile(file, { signal: ac.signal, ...FAST });
  const snap = await gen.next();
  expect(snap.value).toHaveLength(200);
  expect(snap.value[0]).toBe("line 50");
  expect(snap.value[199]).toBe("line 249");
  ac.abort();
});

it("yields newly appended lines incrementally", async () => {
  fs.writeFileSync(file, "first\n");
  const ac = new AbortController();
  const gen = tailFile(file, { signal: ac.signal, ...FAST });
  expect((await gen.next()).value).toEqual(["first"]);
  fs.appendFileSync(file, "second\nthird\n");
  expect((await gen.next()).value).toEqual(["second", "third"]);
  ac.abort();
});

it("buffers a line split across two appends and yields it whole", async () => {
  fs.writeFileSync(file, "x\n");
  const ac = new AbortController();
  const gen = tailFile(file, { signal: ac.signal, ...FAST });
  await gen.next(); // snapshot
  fs.appendFileSync(file, "par");
  fs.appendFileSync(file, "tial\n");
  expect((await gen.next()).value).toEqual(["partial"]);
  ac.abort();
});

it("resets and re-snapshots when the file is truncated", async () => {
  fs.writeFileSync(file, "aaaa\nbbbb\n");
  const ac = new AbortController();
  const gen = tailFile(file, { signal: ac.signal, ...FAST });
  await gen.next(); // ["aaaa","bbbb"]
  fs.writeFileSync(file, "c\n"); // smaller than previous offset
  expect((await gen.next()).value).toEqual(["c"]);
  ac.abort();
});

it("yields a placeholder for a missing file, then picks up content", async () => {
  const missing = path.join(dir, "later.log");
  const ac = new AbortController();
  const gen = tailFile(missing, { signal: ac.signal, ...FAST });
  expect((await gen.next()).value).toEqual([LOG_PLACEHOLDER]);
  fs.writeFileSync(missing, "hello\n");
  expect((await gen.next()).value).toEqual(["hello"]);
  ac.abort();
});

it("stops iterating once the signal is aborted", async () => {
  fs.writeFileSync(file, "x\n");
  const ac = new AbortController();
  const gen = tailFile(file, { signal: ac.signal, ...FAST });
  await gen.next(); // snapshot
  ac.abort();
  expect((await gen.next()).done).toBe(true);
});
