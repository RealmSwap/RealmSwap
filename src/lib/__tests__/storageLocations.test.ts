import { describe, it, expect } from "vitest";
import path from "path";
import {
  storageLocationPaths,
  resolveStorageTarget,
  isInsideRoot,
  openFolderCommand,
} from "../storageLocations";

const root = path.join("DATA");

describe("storageLocationPaths", () => {
  it("lists the well-known locations in order with absolute paths", () => {
    const locs = storageLocationPaths(root);
    expect(locs.map((l) => l.key)).toEqual([
      "dataRoot",
      "database",
      "servers",
      "backups",
      "snapshots",
      "steamcmd",
    ]);
    expect(locs.find((l) => l.key === "servers")!.path).toBe(
      path.join("DATA", "local-servers")
    );
    expect(locs.find((l) => l.key === "database")!).toMatchObject({
      path: path.join("DATA", "realmswap.db"),
      isFile: true,
    });
  });
});

describe("resolveStorageTarget", () => {
  it("resolves a folder key to its absolute path", () => {
    expect(resolveStorageTarget("backups", root)).toBe(
      path.join("DATA", "local-backups")
    );
  });

  it("resolves a file key (database) to its CONTAINING folder", () => {
    expect(resolveStorageTarget("database", root)).toBe(path.join("DATA"));
  });

  it("returns null for an unknown key", () => {
    expect(resolveStorageTarget("../etc", root)).toBeNull();
    expect(resolveStorageTarget("nope", root)).toBeNull();
  });
});

describe("isInsideRoot", () => {
  it("accepts the root itself and nested paths", () => {
    expect(isInsideRoot(root, root)).toBe(true);
    expect(isInsideRoot(root, path.join("DATA", "local-servers", "s1"))).toBe(true);
  });

  it("rejects traversal and sibling paths", () => {
    expect(isInsideRoot(root, path.join("DATA", "..", "secret"))).toBe(false);
    expect(isInsideRoot(root, path.join("OTHER"))).toBe(false);
  });
});

describe("openFolderCommand", () => {
  it("uses explorer on win32", () => {
    expect(openFolderCommand("win32", "C:\\x")).toEqual({ cmd: "explorer", args: ["C:\\x"] });
  });
  it("uses open on darwin", () => {
    expect(openFolderCommand("darwin", "/x")).toEqual({ cmd: "open", args: ["/x"] });
  });
  it("falls back to xdg-open elsewhere", () => {
    expect(openFolderCommand("linux", "/x")).toEqual({ cmd: "xdg-open", args: ["/x"] });
  });
});
