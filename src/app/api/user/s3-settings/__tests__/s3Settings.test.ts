import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level guards for the offsite (S3) settings API: the ADMIN gate, secret
 * masking on GET, and blank-means-keep-credentials on PUT. Prisma and auth are
 * mocked; zod + route logic are real.
 */

const bag = vi.hoisted(() => ({
  role: "ADMIN",
  saved: null as any,
  upserts: [] as any[],
  audit: [] as any[],
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: async () => ({ id: "user1", role: bag.role }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get s3Setting() {
      return {
        findUnique: async () => bag.saved,
        upsert: async (args: any) => {
          bag.upserts.push(args);
          return {};
        },
      };
    },
    get activityLog() {
      return {
        create: async (args: any) => {
          bag.audit.push(args.data);
          return {};
        },
      };
    },
  },
}));

import { GET as getSettings, PUT as putSettings } from "@/app/api/user/s3-settings/route";

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/user/s3-settings`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
}

beforeEach(() => {
  bag.role = "ADMIN";
  bag.saved = null;
  bag.upserts = [];
  bag.audit = [];
});

describe("GET /api/user/s3-settings", () => {
  it("is ADMIN-gated", async () => {
    bag.role = "USER";
    const res = await getSettings();
    expect(res.status).toBe(403);
  });

  it("returns masked hints, never the credentials", async () => {
    bag.saved = { enabled: true, endpoint: null, region: "us-east-1", bucket: "b", accessKey: "AKIA12345678", secretKey: "super-secret" };
    const res = await getSettings();
    const data = await res.json();
    expect(data.configured).toBe(true);
    expect(data.accessKeyHint).toBe("••••5678");
    expect(JSON.stringify(data)).not.toContain("super-secret");
    expect(JSON.stringify(data)).not.toContain("AKIA12345678");
  });
});

describe("PUT /api/user/s3-settings", () => {
  it("requires credentials when nothing is saved yet", async () => {
    const res = await putSettings(req("PUT", { bucket: "b" }));
    expect(res.status).toBe(400);
    expect(bag.upserts.length).toBe(0);
  });

  it("saves a full config on first use and audits it", async () => {
    const res = await putSettings(req("PUT", {
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "my-bucket",
      accessKey: "AKIA-new",
      secretKey: "new-secret",
      enabled: true,
    }));
    expect(res.status).toBe(200);
    expect(bag.upserts.length).toBe(1);
    expect(bag.upserts[0].create.secretKey).toBe("new-secret");
    expect(bag.audit[0].action).toBe("UPDATE_S3_SETTINGS");
  });

  it("keeps saved credentials when the fields are blank", async () => {
    bag.saved = { accessKey: "AKIA-saved", secretKey: "saved-secret" };
    const res = await putSettings(req("PUT", { bucket: "renamed-bucket", accessKey: "", secretKey: "" }));
    expect(res.status).toBe(200);
    expect(bag.upserts[0].update.accessKey).toBe("AKIA-saved");
    expect(bag.upserts[0].update.secretKey).toBe("saved-secret");
    expect(bag.upserts[0].update.bucket).toBe("renamed-bucket");
  });
});
