import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Orchestration guards for the Update-all route: one snapshot window for the
 * whole batch, resolution happens BEFORE any snapshot, rows only move after
 * the boot test passes, and any failure rolls the entire window back.
 * updateApply (provider resolution) is mocked — the pure resolution logic has
 * its own coverage via checkModUpdates; what's under test here is the route's
 * snapshot/rollback/row-update choreography.
 */

const bag = vi.hoisted(() => ({
  isAdmin: true,
  access: null as any,
  installations: [] as any[],
  updates: { rows: [], updates: [] as any[] },
  planned: new Map<string, { newVersionNumber: string; fail?: Error }>(),
  createdSnapshots: [] as string[],
  restored: [] as string[],
  discarded: [] as string[],
  bootError: null as Error | null,
  versionWrites: [] as any[],
  audit: [] as any[],
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => ({ id: "user1" }) }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async (_id: string, _uid: string, required?: string) => {
    if (required === "ADMIN" && !bag.isAdmin) return null;
    return bag.access;
  },
}));
vi.mock("@/lib/db", () => {
  const prisma = {
    modInstallation: {
      findMany: async () => bag.installations,
      update: async (args: any) => {
        bag.versionWrites.push(args);
        return {};
      },
    },
    serverSnapshot: { delete: async () => ({}) },
    activityLog: {
      create: async (args: any) => {
        bag.audit.push(args.data);
        return {};
      },
    },
  };
  return { prisma };
});
vi.mock("@/lib/snapshots", () => ({
  createSnapshot: async (_serverId: string, _userId: string, name: string) => {
    bag.createdSnapshots.push(name);
    return { id: `snap-${bag.createdSnapshots.length}` };
  },
  restoreSnapshot: async (id: string) => {
    bag.restored.push(id);
  },
  discardSnapshot: async (id: string) => {
    bag.discarded.push(id);
  },
}));
vi.mock("@/lib/runners/sandbox", () => ({
  testServerBoot: async () => {
    if (bag.bootError) throw bag.bootError;
    return true;
  },
  SandboxBootError: class SandboxBootError extends Error {
    output: string;
    constructor(message: string, output: string) {
      super(message);
      this.output = output;
    }
  },
}));
vi.mock("@/lib/mods/updateApply", () => ({
  resolveModUpdate: async (installation: any) => {
    const plan = bag.planned.get(installation.packageId);
    if (!plan) throw new Error(`No update path for ${installation.packageId}`);
    return {
      newVersionNumber: plan.newVersionNumber,
      applyUpdate: async () => {
        if (plan.fail) throw plan.fail; // failure at APPLY time (mid-window)
      },
    };
  },
}));

import { POST as updateAll } from "@/app/api/servers/[id]/mods/update-all/route";

const SERVER = { id: "s1", name: "Test Server", game: "Minecraft", status: "STOPPED" };

function req() {
  return new NextRequest("http://localhost/api/servers/s1/mods/update-all", { method: "POST" });
}

beforeEach(() => {
  bag.isAdmin = true;
  bag.access = { server: SERVER };
  bag.installations = [];
  bag.planned = new Map();
  bag.createdSnapshots = [];
  bag.restored = [];
  bag.discarded = [];
  bag.bootError = null;
  bag.versionWrites = [];
  bag.audit = [];
});

describe("POST /mods/update-all", () => {
  it("updates all planned mods in ONE snapshot window, rows after boot test", async () => {
    bag.installations = [
      { id: "i1", packageId: "mod-a", provider: "modrinth", version: "1.0.0", name: "A" },
      { id: "i2", packageId: "mod-b", provider: "thunderstore", version: "0.9.0", name: "B" },
    ];
    bag.planned.set("mod-a", { newVersionNumber: "1.1.0" });
    bag.planned.set("mod-b", { newVersionNumber: "1.0.0" });

    const res = await updateAll(req(), { params: { id: "s1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.updated).toEqual([
      { name: "A", from: "1.0.0", to: "1.1.0" },
      { name: "B", from: "0.9.0", to: "1.0.0" },
    ]);
    expect(bag.createdSnapshots).toHaveLength(1);
    // Rows only move after the boot test passed.
    expect(bag.versionWrites.map((w) => w.where.id)).toEqual(["i1", "i2"]);
    expect(bag.restored).toHaveLength(0);
    expect(bag.discarded).toHaveLength(0);
    expect(bag.audit[0].action).toBe("UPDATE_MOD");
  });

  it("skips up-to-date and unresolvable mods without snapshotting", async () => {
    bag.installations = [
      { id: "i1", packageId: "mod-current", provider: "modrinth", version: "2.0.0", name: "Current" },
      { id: "i2", packageId: "mod-gone", provider: "modrinth", version: "1.0.0", name: "Gone" },
      { id: "i3", packageId: "mod-ws", provider: "workshop", version: "1.0.0", name: "Workshop" },
    ];
    bag.planned.set("mod-current", { newVersionNumber: "2.0.0" }); // same = up to date
    // mod-gone has no plan -> resolveModUpdate throws (resolution-phase failure)
    // mod-ws: workshop provider skipped before resolution entirely

    const res = await updateAll(req(), { params: { id: "s1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.updated).toEqual([]);
    expect(bag.createdSnapshots).toHaveLength(0); // nothing to do, no snapshot
    expect(data.skipped).toHaveLength(2);
    expect(data.skipped.map((s: any) => s.name).sort()).toEqual(["Current", "Gone"]);
  });

  it("rolls the WHOLE window back when one apply fails mid-batch", async () => {
    bag.installations = [
      { id: "i1", packageId: "mod-a", provider: "modrinth", version: "1.0.0", name: "A" },
      { id: "i2", packageId: "mod-b", provider: "modrinth", version: "1.0.0", name: "B" },
    ];
    bag.planned.set("mod-a", { newVersionNumber: "1.1.0" });
    bag.planned.set("mod-b", { newVersionNumber: "1.2.0", fail: new Error("download failed") });

    const res = await updateAll(req(), { params: { id: "s1" } });
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.rolledBack).toBe(true);
    expect(bag.createdSnapshots).toHaveLength(1);
    expect(bag.restored).toEqual(["snap-1"]);
    expect(bag.discarded).toEqual(["snap-1"]);
    // No row ever claims a version that was rolled back off disk.
    expect(bag.versionWrites).toHaveLength(0);
    expect(data.updatedBeforeFailure).toEqual([{ name: "A", from: "1.0.0", to: "1.1.0" }]);
  });

  it("rolls back and surfaces boot output when the sandbox boot test fails", async () => {
    bag.installations = [{ id: "i1", packageId: "mod-a", provider: "modrinth", version: "1.0.0", name: "A" }];
    bag.planned.set("mod-a", { newVersionNumber: "1.1.0" });
    bag.bootError = new (await import("@/lib/runners/sandbox")).SandboxBootError("boot failed", "line1\nline2");

    const res = await updateAll(req(), { params: { id: "s1" } });
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.rolledBack).toBe(true);
    expect(data.bootOutput).toBe("line1\nline2");
    expect(bag.versionWrites).toHaveLength(0);
  });

  it("refuses while the server is running and reports non-admins", async () => {
    bag.access = { server: { ...SERVER, status: "RUNNING" } };
    const running = await updateAll(req(), { params: { id: "s1" } });
    expect(running.status).toBe(400);

    bag.access = { server: SERVER };
    bag.isAdmin = false;
    const forbidden = await updateAll(req(), { params: { id: "s1" } });
    expect(forbidden.status).toBe(403);
  });
});
