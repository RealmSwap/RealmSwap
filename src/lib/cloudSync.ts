import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

export class CloudSync {
  private client: S3Client | null = null;
  private bucket: string | null = null;

  constructor() {
    // In a real app, these would come from the database per-user, or from process.env
    // We'll mock them to load from env for now, or expect them passed in
    const region = process.env.S3_REGION || "us-east-1";
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    this.bucket = process.env.S3_BUCKET || null;

    if (accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region,
        endpoint, // Important for Cloudflare R2 / DigitalOcean Spaces
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle: true,
      });
    }
  }

  /**
   * Configure dynamically at runtime (for user-specific settings)
   */
  configure(config: { endpoint: string, region: string, bucket: string, accessKey: string, secretKey: string }) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region || "us-east-1",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
  }

  async uploadSnapshot(serverId: string, snapshotPath: string) {
    if (!this.client || !this.bucket) {
      console.log(`[CloudSync] Skipping upload for ${serverId}: S3 not configured.`);
      return;
    }

    if (!fs.existsSync(snapshotPath)) {
      throw new Error("Snapshot file does not exist");
    }

    const fileName = path.basename(snapshotPath);
    const fileStream = fs.createReadStream(snapshotPath);
    const stat = fs.statSync(snapshotPath);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: `realmswap/servers/${serverId}/backups/${fileName}`,
      Body: fileStream,
      ContentLength: stat.size,
    });

    try {
      await this.client.send(command);
      console.log(`[CloudSync] Successfully uploaded ${fileName} to S3.`);
    } catch (err) {
      console.error(`[CloudSync] Failed to upload ${fileName}:`, err);
      throw err;
    }
  }
}

export const cloudSync = new CloudSync();
