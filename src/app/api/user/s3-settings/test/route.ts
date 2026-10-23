import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { CloudSync } from "@/lib/cloudSync";

/**
 * Reachability check for offsite (S3) credentials — validates the submitted
 * values (or the saved ones, for blank credential fields) with a HeadBucket
 * WITHOUT saving, so "Save" never has to be a leap of faith.
 */

const testSchema = z.object({
  endpoint: z.string().trim().max(255).nullish(),
  region: z.string().trim().max(64).optional(),
  bucket: z.string().trim().min(1).max(255),
  accessKey: z.string().trim().max(255).optional(),
  secretKey: z.string().trim().max(255).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = testSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bucket name is required" }, { status: 400 });
  }

  const existing = await prisma.s3Setting.findUnique({ where: { userId: user.id } });
  const accessKey = parsed.data.accessKey || existing?.accessKey;
  const secretKey = parsed.data.secretKey || existing?.secretKey;
  if (!accessKey || !secretKey) {
    return NextResponse.json({ error: "No saved credentials to test against — enter an Access Key and Secret Key" }, { status: 400 });
  }

  try {
    const sync = new CloudSync({
      endpoint: parsed.data.endpoint || null,
      region: parsed.data.region || "us-east-1",
      bucket: parsed.data.bucket,
      accessKey,
      secretKey,
    });
    await sync.testConnection();
    return NextResponse.json({ success: true, message: `Connection to bucket '${parsed.data.bucket}' succeeded.` });
  } catch (err: any) {
    // Pass the SDK's message through — wrong key vs wrong bucket vs wrong
    // endpoint are indistinguishable to the operator otherwise.
    return NextResponse.json(
      { error: `Connection failed: ${err?.message || "unknown error"}` },
      { status: 400 }
    );
  }
}
