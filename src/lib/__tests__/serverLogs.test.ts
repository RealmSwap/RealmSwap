import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { appendLog, clearLogs, getServerLogTail, listLogArchives, readLogArchive, serverLogFile } from "../serverLogs";

describe("serverLogs", () => {
  const original = process.env.GAMEVAULT_DATA_DIR;
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs-logs-"));
    process.env.GAMEVAULT_DATA_DIR = tmp;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GAMEVAULT_DATA_DIR;
    else process.env.GAMEVAULT_DATA_DIR = original;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // Game-style lines (leading timestamp) round-trip verbatim through
  // appendLog; only untimestamped manager lines get a stamp (covered below).
  it("appends lines and reads them back as a tail", () => {
    clearLogs("s1");
    appendLog("s1", "[12:00:01] line one");
    appendLog("s1", "[12:00:02] line two\n");
    expect(getServerLogTail("s1")).toBe("[12:00:01] line one\n[12:00:02] line two\n");
  });

  it("clearLogs removes the file and tail reports no logs", () => {
    appendLog("s2", "hello");
    clearLogs("s2");
    expect(fs.existsSync(serverLogFile("s2"))).toBe(false);
    expect(getServerLogTail("s2")).toContain("No logs available");
  });

  it("getServerLogTail returns only the last N lines", () => {
    clearLogs("s3");
    for (let i = 0; i < 10; i++) appendLog("s3", `[00:00:0${i}] n${i}`);
    expect(getServerLogTail("s3", 3)).toBe("[00:00:07] n7\n[00:00:08] n8\n[00:00:09] n9\n");
  });

  describe("timestamp stamping", () => {
    const STAMP_RE = /^\[\d{2}:\d{2}:\d{2}\] /;

    it("stamps manager-side lines", () => {
      clearLogs("s4");
      appendLog("s4", "[Docker] Container started");
      const written = fs.readFileSync(serverLogFile("s4"), "utf-8");
      expect(written).toMatch(STAMP_RE);
      expect(written).toContain("[Docker] Container started\n");
    });

    it("stamps a multi-line stdout chunk line by line, blanks excluded", () => {
      clearLogs("s5");
      appendLog("s5", "manager a\n[13:00:00] game b\n\nmanager c");
      const lines = fs.readFileSync(serverLogFile("s5"), "utf-8").split("\n");
      expect(lines[0]).toMatch(STAMP_RE);
      expect(lines[0]).toContain("manager a");
      expect(lines[1]).toBe("[13:00:00] game b");
      expect(lines[2]).toBe("");
      expect(lines[3]).toMatch(STAMP_RE);
      expect(lines[3]).toContain("manager c");
    });
  });

  describe("log archive readers", () => {
    const serverDir = () => path.join(tmp, "local-servers", "s6");

    function writeArchive(name: string, content: string, mtime: Date) {
      fs.mkdirSync(serverDir(), { recursive: true });
      const zip = new AdmZip();
      zip.addFile("server.log", Buffer.from(content, "utf-8"));
      const zipPath = path.join(serverDir(), name);
      zip.writeZip(zipPath);
      fs.utimesSync(zipPath, mtime, mtime);
      return zipPath;
    }

    it("lists only rotation-named archives, newest first", () => {
      fs.mkdirSync(serverDir(), { recursive: true });
      fs.writeFileSync(path.join(serverDir(), "server.log"), "live\n");
      writeArchive("server-log-2026-10-21T10-00-00-000Z.zip", "old", new Date("2026-10-21T10:00:00Z"));
      writeArchive("server-log-2026-10-23T10-00-00-000Z.zip", "new", new Date("2026-10-23T10:00:00Z"));
      fs.writeFileSync(path.join(serverDir(), "not-a-log.zip"), "junk");

      const archives = listLogArchives("s6");
      expect(archives.map((a) => a.name)).toEqual([
        "server-log-2026-10-23T10-00-00-000Z.zip",
        "server-log-2026-10-21T10-00-00-000Z.zip",
      ]);
      expect(archives[0].createdAt).toBe(new Date("2026-10-23T10:00:00Z").toISOString());
      expect(archives[0].sizeBytes).toBeGreaterThan(0);
    });

    it("returns an empty list when the server has no log dir yet", () => {
      expect(listLogArchives("s7")).toEqual([]);
    });

    it("reads archive content", () => {
      writeArchive("server-log-2026-10-23T10-00-00-000Z.zip", "line1\nline2\n", new Date());

      expect(readLogArchive("s6", "server-log-2026-10-23T10-00-00-000Z.zip")).toEqual({
        content: "line1\nline2\n",
        truncated: false,
      });
    });

    it("rejects names that are not rotation archives", () => {
      expect(() => readLogArchive("s6", "../../etc/passwd")).toThrow("Invalid log archive name");
      expect(() => readLogArchive("s6", "server.log")).toThrow("Invalid log archive name");
    });

    it("throws a not-found for missing archives", () => {
      expect(() => readLogArchive("s6", "server-log-404.zip")).toThrow("Log archive not found");
    });

    it("keeps only the tail of oversized archives", () => {
      const filler = "x".repeat(1024) + "\n";
      const big = filler.repeat(2100); // > 2 MB
      writeArchive("server-log-2026-10-23T10-00-00-000Z.zip", big + "FINAL LINE", new Date());

      const result = readLogArchive("s6", "server-log-2026-10-23T10-00-00-000Z.zip");
      expect(result.truncated).toBe(true);
      expect(result.content.endsWith("FINAL LINE")).toBe(true);
      expect(result.content.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    });
  });
});
