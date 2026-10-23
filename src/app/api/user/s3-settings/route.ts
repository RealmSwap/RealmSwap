import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

/**
 * Per-user offsite (S3) storage settings, ADMIN-gated. Secrets are encrypted
 * at rest by the Prisma-boundary extension and never returned by the API —
 * the UI keeps blank inputs meaning "unchanged".
 */

const upsertSchema = z.object({
  endpoint: z.string().trim().max(255).nullish(),
  region: z.string().trim().max(64).optional(),
  bucket: z.string().trim().min(1).max(255),
  accessKey: z.string().trim().max(255).optional(),
  secretKey: z.string().trim().max(255).optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const setting = await prisma.s3Setting.findUnique({ where: { userId: user.id } });
  if (!setting) {
    return NextResponse.json({ configured: false, enabled: true, endpoint: null, region: "us-east-1", bucket: "", accessKeyHint: null });
  }

  return NextResponse.json({
    configured: true,
    enabled: setting.enabled,
    endpoint: setting.endpoint,
    region: setting.region,
    bucket: setting.bucket,
    // Last 4 characters so the operator can tell which key is saved without
    // the credential itself leaving the database.
    accessKeyHint: setting.accessKey.length > 4 ? `••••${setting.accessKey.slice(-4)}` : "••••",
  });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid S3 settings payload" }, { status: 400 });
  }
  const { endpoint, region, bucket, accessKey, secretKey, enabled } = parsed.data;

  const existing = await prisma.s3Setting.findUnique({ where: { userId: user.id } });
  const nextAccessKey = accessKey || existing?.accessKey;
  const nextSecretKey = secretKey || existing?.secretKey;
  if (!nextAccessKey || !nextSecretKey) {
    return NextResponse.json(
      { error: existing ? "Access Key and Secret Key are required to replace saved credentials" : "Access Key and Secret Key are required" },
      { status: 400 }
    );
  }

  await prisma.s3Setting.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      endpoint: endpoint || null,
      region: region || "us-east-1",
      bucket,
      accessKey: nextAccessKey,
      secretKey: nextSecretKey,
      enabled: enabled ?? true,
    },
    update: {
      endpoint: endpoint || null,
      region: region || "us-east-1",
      bucket,
      accessKey: nextAccessKey,
      secretKey: nextSecretKey,
      enabled: enabled ?? true,
    },
  });

  await prisma.activityLog
    .create({
      data: {
        userId: user.id,
        action: "UPDATE_S3_SETTINGS",
        details: `Offsite storage settings saved (bucket '${bucket}', uploads ${enabled ?? true ? "enabled" : "disabled"}).`,
      },
    })
    .catch(() => {});

  return NextResponse.json({ success: true, message: "S3 settings saved. Future backups will be uploaded offsite." });
}
