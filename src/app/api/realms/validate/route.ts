import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import os from "os";
import * as tar from "tar";
import crypto from "crypto";
import { getAuthenticatedUser } from "@/lib/auth";

// Uploads are capped: this is a desktop app streaming to the local disk, but
// an unbounded body would happily fill the disk on a malformed/huge upload.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024; // 8 GiB

// Uploaded archives are tracked server-side and referenced by an opaque id.
// The import route accepts ONLY this id — never a client-named path, which
// would let any authenticated caller extract and delete arbitrary files.
const globalForUploads = globalThis as unknown as {
  realmUploads: Map<string, { path: string; expiresAt: number }>;
};
const uploads = (globalForUploads.realmUploads ??= new Map());
const UPLOAD_TTL_MS = 30 * 60 * 1000;

function pruneUploads() {
  const now = Date.now();
  for (const [id, entry] of Array.from(uploads.entries())) {
    if (entry.expiresAt < now) {
      try { fs.unlinkSync(entry.path); } catch (_) {}
      uploads.delete(id);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    pruneUploads();

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `realmswap-${crypto.randomBytes(8).toString('hex')}.realm`);

    if (!req.body) return new NextResponse("No file provided", { status: 400 });

    const nodeStream = Readable.fromWeb(req.body as any);
    const writeStream = fs.createWriteStream(tempFile);

    let bytesWritten = 0;
    nodeStream.on("data", (chunk) => {
      bytesWritten += chunk.length;
      if (bytesWritten > MAX_UPLOAD_BYTES) {
        nodeStream.destroy(new Error(`Package exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024 * 1024))} GiB upload limit.`));
      }
    });

    await new Promise((resolve, reject) => {
      nodeStream.pipe(writeStream).on("finish", () => resolve(true)).on("error", reject);
    });

    let manifestData = "";

    await tar.t({
      file: tempFile,
      onentry: entry => {
        if (entry.path === "realm.json" || entry.path === "./realm.json") {
          entry.on("data", c => manifestData += c.toString());
        } else {
          entry.resume();
        }
      }
    });

    if (!manifestData) {
      fs.unlinkSync(tempFile);
      return new NextResponse("Invalid package: Missing realm.json", { status: 400 });
    }

    const manifest = JSON.parse(manifestData);

    // Get temp file size
    const stats = fs.statSync(tempFile);

    const uploadId = crypto.randomUUID();
    uploads.set(uploadId, { path: tempFile, expiresAt: Date.now() + UPLOAD_TTL_MS });

    return NextResponse.json({
      manifest,
      uploadId,
      sizeBytes: stats.size
    });

  } catch (err: any) {
    console.error(err);
    return new NextResponse(err.message, { status: 500 });
  }
}
