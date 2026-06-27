import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { appendLog, clearLogs, getServerLogTail, serverLogFile } from "../serverLogs";

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

  it("appends lines and reads them back as a tail", () => {
    clearLogs("s1");
    appendLog("s1", "line one");
    appendLog("s1", "line two\n");
    expect(getServerLogTail("s1")).toBe("line one\nline two\n");
  });

  it("clearLogs removes the file and tail reports no logs", () => {
    appendLog("s2", "hello");
    clearLogs("s2");
    expect(fs.existsSync(serverLogFile("s2"))).toBe(false);
    expect(getServerLogTail("s2")).toContain("No logs available");
  });

  it("getServerLogTail returns only the last N lines", () => {
    clearLogs("s3");
    for (let i = 0; i < 10; i++) appendLog("s3", `n${i}`);
    expect(getServerLogTail("s3", 3)).toBe("n7\nn8\nn9\n");
  });
});
