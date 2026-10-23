import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

export interface CloudSyncConfig {
  endpoint?: string | null; // null/undefined = AWS default; set for R2 / Spaces / Minio
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

/**
 * The S3 key every backup of `serverId` is stored under. Derived from the
 * local file name so download can rebuild the key from the backup row alone.
 */
export function offsiteBackupKey(serverId: string, filePath: string): string {
  return `realmswap/servers/${serverId}/backups/${path.basename(filePath)}`;
}

/** Offsite config from the legacy S3_* env vars — the fallback when the user has none saved. */
export function envCloudSyncConfig(): CloudSyncConfig | null {
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!accessKey || !secretKey || !bucket) return null;
  return {
    endpoint: process.env.S3_ENDPOINT || null,
    region: process.env.S3_REGION || "us-east-1",
    bucket,
    accessKey,
    secretKey,
  };
}

export class CloudSync {
  private client: S3Client;
  private bucket: string;

  constructor(config: CloudSyncConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region || "us-east-1",
      endpoint: config.endpoint || undefined, // Important for Cloudflare R2 / DigitalOcean Spaces
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  /** Cheap reachability + permission check for saved credentials. */
  async testConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async uploadSnapshot(serverId: string, snapshotPath: string): Promise<{ key: string }> {
    if (!fs.existsSync(snapshotPath)) {
      throw new Error("Snapshot file does not exist");
    }

    const key = offsiteBackupKey(serverId, snapshotPath);
    const stat = fs.statSync(snapshotPath);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fs.createReadStream(snapshotPath),
      ContentLength: stat.size,
    });

    try {
      await this.client.send(command);
      console.log(`[CloudSync] Successfully uploaded ${path.basename(snapshotPath)} to offsite storage.`);
      return { key };
    } catch (err) {
      console.error(`[CloudSync] Failed to upload ${path.basename(snapshotPath)}:`, err);
      throw err;
    }
  }

  /**
   * Download a stored backup to `destPath`. Streams to `destPath.tmp` first so
   * a dropped connection can never leave a partial file at the real path.
   */
  async downloadSnapshot(key: string, destPath: string): Promise<void> {
    const tmpPath = `${destPath}.tmp`;
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = response.Body as Readable;
      if (!body) throw new Error("Offsite storage returned an empty response body");
      await pipeline(body, fs.createWriteStream(tmpPath));
      fs.renameSync(tmpPath, destPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      throw err;
    }
  }
}
