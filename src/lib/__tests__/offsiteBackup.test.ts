import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Offsite (S3) replication: config resolution (saved settings → env fallback),
 * the outcome recorded on the backup row, and the failure notification. The
 * S3 client and prisma are mocked; the bookkeeping logic under test is real.
 */

const bag = vi.hoisted(() => ({
  s3Setting: null as any,
  backupRow: null as any,
  updates: [] as any[],
  audit: [] as any[],
  envConfig: null as any,
  uploadError: null as Error | null,
  downloadError: null as Error | null,
  notified: [] as any[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    get s3Setting() {
      return { findUnique: async () => bag.s3Setting };
    },
    get backup() {
      return {
        findUnique: async () => bag.backupRow,
        update: async (args: any) => {
          bag.updates.push(args);
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

vi.mock("@/lib/cloudSync", () => ({
  CloudSync: class {
    async uploadSnapshot() {
      if (bag.uploadError) throw bag.uploadError;
      return { key: "realmswap/servers/s1/backups/b1.zip" };
    }
    async downloadSnapshot(_key: string, destPath: string) {
      if (bag.downloadError) throw bag.downloadError;
      return destPath;
    }
    async testConnection() {}
  },
  envCloudSyncConfig: () => bag.envConfig,
  offsiteBackupKey: (serverId: string, filePath: string) =>
    `realmswap/servers/${serverId}/backups/${filePath.split("/").pop()}`,
}));

vi.mock("@/lib/notifications", () => ({
  sendNotification: async (...args: any[]) => {
    bag.notified.push(args);
  },
}));

import { resolveOffsiteConfig, uploadOffsiteBackup, downloadOffsiteBackup } from "@/lib/offsiteBackup";

const savedConfig = {
  endpoint: "https://acct.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "user-bucket",
  accessKey: "AKIA-saved",
  secretKey: "saved-secret",
};

const envConfig = {
  endpoint: null,
  region: "us-east-1",
  bucket: "env-bucket",
  accessKey: "AKIA-env",
  secretKey: "env-secret",
};

beforeEach(() => {
  bag.s3Setting = null;
  bag.updates = [];
  bag.audit = [];
  bag.envConfig = null;
  bag.uploadError = null;
  bag.downloadError = null;
  bag.notified = [];
  bag.backupRow = null;
});

afterEach(() => {
  delete process.env.S3_ACCESS_KEY;
  delete process.env.S3_SECRET_KEY;
  delete process.env.S3_BUCKET;
});

describe("resolveOffsiteConfig", () => {
  it("prefers the user's saved settings", async () => {
    bag.s3Setting = { ...savedConfig, enabled: true };
    await expect(resolveOffsiteConfig("user1")).resolves.toMatchObject({ bucket: "user-bucket" });
  });

  it("falls back to env vars when the saved settings are disabled", async () => {
    bag.s3Setting = { ...savedConfig, enabled: false };
    bag.envConfig = envConfig;
    await expect(resolveOffsiteConfig("user1")).resolves.toMatchObject({ bucket: "env-bucket" });
  });

  it("falls back to env vars when the user has no saved settings", async () => {
    bag.envConfig = envConfig;
    await expect(resolveOffsiteConfig("user1")).resolves.toMatchObject({ bucket: "env-bucket" });
  });

  it("returns null when nothing is configured (no attempt should be made)", async () => {
    await expect(resolveOffsiteConfig("user1")).resolves.toBeNull();
  });
});

describe("uploadOffsiteBackup", () => {
  const args = ["b1", "s1", "user1", "/tmp/backups/b1.zip", "My Server"] as const;

  it("records UPLOADED after a successful upload", async () => {
    bag.s3Setting = { ...savedConfig, enabled: true };
    await uploadOffsiteBackup(...args);
    const statuses = bag.updates.map((u) => u.data.offsiteStatus);
    expect(statuses).toEqual(["PENDING", "UPLOADED"]);
    expect(bag.updates[1].data.offsiteUploadedAt).toBeTruthy();
  });

  it("records FAILED with the error, notifies the owner, and audits — never throws", async () => {
    bag.s3Setting = { ...savedConfig, enabled: true };
    bag.uploadError = new Error("boom: 403 AccessDenied");
    await expect(uploadOffsiteBackup(...args)).resolves.toBeUndefined();
    const failed = bag.updates.find((u) => u.data.offsiteStatus === "FAILED");
    expect(failed.data.offsiteError).toContain("403 AccessDenied");
    expect(bag.notified.length).toBe(1);
    expect(bag.notified[0][0]).toBe("user1");
    expect(bag.notified[0][1]).toContain("Offsite Backup Failed");
    expect(bag.audit[0].action).toBe("OFFSITE_BACKUP_FAILED");
  });

  it("leaves the row untouched when nothing is configured", async () => {
    await uploadOffsiteBackup(...args);
    expect(bag.updates).toEqual([]);
    expect(bag.notified).toEqual([]);
  });
});

describe("downloadOffsiteBackup", () => {
  it("refuses backups with no offsite copy", async () => {
    bag.backupRow = { id: "b1", serverId: "s1", userId: "user1", filePath: "/x/b1.zip", offsiteStatus: "FAILED" };
    await expect(downloadOffsiteBackup("b1")).rejects.toThrow(/no offsite copy/i);
  });

  it("refuses when offsite storage is not configured", async () => {
    bag.backupRow = { id: "b1", serverId: "s1", userId: "user1", filePath: "/x/b1.zip", offsiteStatus: "UPLOADED" };
    await expect(downloadOffsiteBackup("b1")).rejects.toThrow(/not configured/i);
  });

  it("downloads to a temp zip path it owns", async () => {
    bag.backupRow = { id: "b1", serverId: "s1", userId: "user1", filePath: "/x/b1.zip", offsiteStatus: "UPLOADED" };
    bag.s3Setting = { ...savedConfig, enabled: true };
    const dest = await downloadOffsiteBackup("b1");
    expect(dest).toMatch(/realmswap-restore-.*[/\\]b1\.zip$/);
  });

  it("wraps download failures with an actionable message", async () => {
    bag.backupRow = { id: "b1", serverId: "s1", userId: "user1", filePath: "/x/b1.zip", offsiteStatus: "UPLOADED" };
    bag.s3Setting = { ...savedConfig, enabled: true };
    bag.downloadError = new Error("NoSuchKey");
    await expect(downloadOffsiteBackup("b1")).rejects.toThrow(/Could not download the offsite copy/);
  });
});
