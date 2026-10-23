import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level guards for the automations API — the class of bug this PR fixes
 * (editor/route field mismatches and unauthenticated verbs) is invisible to
 * lib tests because the routes had zero coverage. Boundary modules (auth,
 * prisma, the scheduler) are mocked; the zod validation and schedule math
 * under test are real.
 */

const bag = vi.hoisted(() => ({
  user: { id: "user1" } as any,
  isAdmin: true,
  access: { server: { id: "s1", name: "Test Server" } } as any,
  findMany: [] as any[],
  findUnique: null as any,
  creates: [] as any[],
  updates: [] as any[],
  deletes: [] as any[],
  actionDeletes: [] as any[],
  executed: [] as string[],
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: async () => bag.user }));
vi.mock("@/lib/serverAuth", () => ({
  verifyServerAccess: async (_serverId: string, _userId: string, required?: string) => {
    if (required === "ADMIN" && !bag.isAdmin) return null;
    return bag.access;
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    get automation() {
      return {
        findMany: async () => bag.findMany,
        findUnique: async () => bag.findUnique,
        create: async (args: any) => {
          bag.creates.push(args);
          return { id: "a1", ...args.data };
        },
        update: async (args: any) => {
          bag.updates.push(args);
          return { id: "a1" };
        },
        delete: async (args: any) => {
          bag.deletes.push(args);
          return {};
        },
      };
    },
    get automationAction() {
      return { deleteMany: async (args: any) => { bag.actionDeletes.push(args); return {}; } };
    },
    get automationCondition() {
      return { deleteMany: async () => ({}) };
    },
  },
}));
vi.mock("@/lib/actionScheduler", () => ({
  executeAutomation: async (id: string) => { bag.executed.push(id); },
}));

import { GET as listAutomations, POST as createAutomation } from "@/app/api/servers/[id]/automations/route";
import { GET as getAutomation, PUT as updateAutomation, DELETE as deleteAutomation } from "@/app/api/servers/[id]/automations/[automationId]/route";
import { POST as executeRoute } from "@/app/api/servers/[id]/automations/[automationId]/execute/route";

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

const actions = [{ type: "STOP_SERVER" }];

beforeEach(() => {
  bag.user = { id: "user1" };
  bag.isAdmin = true;
  bag.access = { server: { id: "s1", name: "Test Server" } };
  bag.findMany = [];
  bag.findUnique = null;
  bag.creates = [];
  bag.updates = [];
  bag.deletes = [];
  bag.actionDeletes = [];
  bag.executed = [];
});

describe("POST /api/servers/[id]/automations", () => {
  it("computes nextRunAt from the editor's cronExpression field (the headline bug)", async () => {
    const res = await createAutomation(
      jsonReq("/api/servers/s1/automations", "POST", {
        name: "Nightly restart",
        triggerType: "CRON",
        triggerConfig: { cronExpression: "0 4 * * *" },
        actions,
      }),
      { params: { id: "s1" } }
    );
    expect(res.status).toBe(201);
    expect(bag.creates).toHaveLength(1);
    const nextRunAt = bag.creates[0].data.nextRunAt;
    expect(nextRunAt).toBeInstanceOf(Date);
    expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("accepts WEEKLY with day/time and computes its next run", async () => {
    const res = await createAutomation(
      jsonReq("/api/servers/s1/automations", "POST", {
        name: "Weekly wipe",
        triggerType: "WEEKLY",
        triggerConfig: { dayOfWeek: 1, timeOfDay: "09:00" },
        actions,
      }),
      { params: { id: "s1" } }
    );
    // Previously a 400: the zod enum rejected what the editor offers.
    expect(res.status).toBe(201);
    expect(bag.creates[0].data.nextRunAt).toBeInstanceOf(Date);
  });

  it("stores a null nextRunAt for event triggers", async () => {
    const res = await createAutomation(
      jsonReq("/api/servers/s1/automations", "POST", {
        name: "Crash cleanup",
        triggerType: "SERVER_CRASH",
        actions,
      }),
      { params: { id: "s1" } }
    );
    expect(res.status).toBe(201);
    expect(bag.creates[0].data.nextRunAt).toBeNull();
  });

  it("rejects an invalid cron expression with an actionable 400", async () => {
    const res = await createAutomation(
      jsonReq("/api/servers/s1/automations", "POST", {
        name: "Bad cron",
        triggerType: "CRON",
        triggerConfig: { cronExpression: "not cron" },
        actions,
      }),
      { params: { id: "s1" } }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid cron/);
  });

  it("rejects a DAILY trigger with no timeOfDay", async () => {
    const res = await createAutomation(
      jsonReq("/api/servers/s1/automations", "POST", {
        name: "No time",
        triggerType: "DAILY",
        actions,
      }),
      { params: { id: "s1" } }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/timeOfDay/);
  });

  it("rejects a ONE_TIME trigger whose runAt is in the past", async () => {
    const res = await createAutomation(
      jsonReq("/api/servers/s1/automations", "POST", {
        name: "Past run",
        triggerType: "ONE_TIME",
        triggerConfig: { runAt: "2020-01-01T00:00" },
        actions,
      }),
      { params: { id: "s1" } }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/future/);
  });

  it("requires authentication and ADMIN", async () => {
    bag.user = null;
    const unauth = await createAutomation(
      jsonReq("/api/servers/s1/automations", "POST", { name: "x", triggerType: "DAILY", triggerConfig: { timeOfDay: "04:00" }, actions }),
      { params: { id: "s1" } }
    );
    expect(unauth.status).toBe(401);

    bag.user = { id: "user1" };
    bag.isAdmin = false;
    const forbidden = await createAutomation(
      jsonReq("/api/servers/s1/automations", "POST", { name: "x", triggerType: "DAILY", triggerConfig: { timeOfDay: "04:00" }, actions }),
      { params: { id: "s1" } }
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("GET automations", () => {
  it("lists automations for viewers and requires auth", async () => {
    bag.findMany = [{ id: "a1", name: "x" }];
    const res = await listAutomations(jsonReq("/api/servers/s1/automations", "GET"), { params: { id: "s1" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "a1", name: "x" }]);

    bag.user = null;
    const unauth = await listAutomations(jsonReq("/api/servers/s1/automations", "GET"), { params: { id: "s1" } });
    expect(unauth.status).toBe(401);
  });
});

describe("PUT /api/servers/[id]/automations/[automationId]", () => {
  const existingRow = {
    id: "a1",
    serverId: "s1",
    triggerType: "CRON",
    triggerConfig: JSON.stringify({ cronExpression: "0 4 * * *" }),
  };

  it("requires auth and ADMIN, and 404s unknown ids", async () => {
    bag.findUnique = existingRow;
    bag.user = null;
    expect((await updateAutomation(jsonReq("/api/servers/s1/automations/a1", "PUT", { enabled: true }), { params: { id: "s1", automationId: "a1" } })).status).toBe(401);

    bag.user = { id: "user1" };
    bag.isAdmin = false;
    expect((await updateAutomation(jsonReq("/api/servers/s1/automations/a1", "PUT", { enabled: true }), { params: { id: "s1", automationId: "a1" } })).status).toBe(403);

    bag.isAdmin = true;
    bag.findUnique = null;
    expect((await updateAutomation(jsonReq("/api/servers/s1/automations/a1", "PUT", { enabled: true }), { params: { id: "s1", automationId: "a1" } })).status).toBe(404);
  });

  it("recomputes nextRunAt when the trigger changes", async () => {
    bag.findUnique = existingRow;
    const res = await updateAutomation(
      jsonReq("/api/servers/s1/automations/a1", "PUT", {
        triggerType: "CRON",
        triggerConfig: { cronExpression: "30 2 * * *" },
      }),
      { params: { id: "s1", automationId: "a1" } }
    );
    expect(res.status).toBe(200);
    expect(bag.updates).toHaveLength(1);
    expect(bag.updates[0].data.nextRunAt).toBeInstanceOf(Date);
  });

  it("repairs a legacy null nextRunAt when an automation is re-enabled", async () => {
    bag.findUnique = existingRow; // pre-fix row: stored config, never a nextRunAt
    const res = await updateAutomation(
      jsonReq("/api/servers/s1/automations/a1", "PUT", { enabled: true }),
      { params: { id: "s1", automationId: "a1" } }
    );
    expect(res.status).toBe(200);
    expect(bag.updates[0].data.nextRunAt).toBeInstanceOf(Date);
  });

  it("leaves the schedule untouched when disabling", async () => {
    bag.findUnique = existingRow;
    await updateAutomation(
      jsonReq("/api/servers/s1/automations/a1", "PUT", { enabled: false }),
      { params: { id: "s1", automationId: "a1" } }
    );
    expect(bag.updates[0].data).not.toHaveProperty("nextRunAt");
  });

  it("rejects an invalid trigger change with 400", async () => {
    bag.findUnique = existingRow;
    const res = await updateAutomation(
      jsonReq("/api/servers/s1/automations/a1", "PUT", {
        triggerType: "CRON",
        triggerConfig: { cronExpression: "nope" },
      }),
      { params: { id: "s1", automationId: "a1" } }
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/servers/[id]/automations/[automationId]", () => {
  it("requires ADMIN", async () => {
    bag.isAdmin = false;
    const res = await deleteAutomation(jsonReq("/api/servers/s1/automations/a1", "DELETE"), { params: { id: "s1", automationId: "a1" } });
    expect(res.status).toBe(403);

    bag.isAdmin = true;
    const ok = await deleteAutomation(jsonReq("/api/servers/s1/automations/a1", "DELETE"), { params: { id: "s1", automationId: "a1" } });
    expect(ok.status).toBe(200);
    expect(bag.deletes).toHaveLength(1);
  });
});

describe("POST /api/servers/[id]/automations/[automationId]/execute", () => {
  it("was callable by anyone — now requires auth and ADMIN", async () => {
    bag.findUnique = { id: "a1", serverId: "s1" };
    bag.user = null;
    expect((await executeRoute(jsonReq("/api/servers/s1/automations/a1/execute", "POST"), { params: { id: "s1", automationId: "a1" } })).status).toBe(401);

    bag.user = { id: "user1" };
    bag.isAdmin = false;
    expect((await executeRoute(jsonReq("/api/servers/s1/automations/a1/execute", "POST"), { params: { id: "s1", automationId: "a1" } })).status).toBe(403);
  });

  it("404s unknown automations and fires execution for admins", async () => {
    bag.user = { id: "user1" };
    bag.isAdmin = true;
    bag.findUnique = null;
    expect((await executeRoute(jsonReq("/api/servers/s1/automations/a1/execute", "POST"), { params: { id: "s1", automationId: "a1" } })).status).toBe(404);

    bag.findUnique = { id: "a1", serverId: "s1" };
    const res = await executeRoute(jsonReq("/api/servers/s1/automations/a1/execute", "POST"), { params: { id: "s1", automationId: "a1" } });
    expect(res.status).toBe(200);
    expect(bag.executed).toEqual(["a1"]);
  });
});
