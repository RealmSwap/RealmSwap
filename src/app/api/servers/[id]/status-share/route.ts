import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { clearStatusCache } from "@/lib/statusShare";
import { relayStatusSnapshot, removeHostedStatus } from "@/lib/statusRelay";
import crypto from "crypto";

async function generateCode(): Promise<string> {
  // 8 hex chars — same space as RealmSync code ids. Retry on the (vanishingly
  // unlikely) unique-constraint collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomBytes(4).toString("hex");
    const clash = await prisma.server.findUnique({ where: { statusShareCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error("Could not allocate a unique share code");
}

// POST: create / rotate / disable the public no-login status link. ADMIN-only —
// the page exposes server name, game, up/down, player counts and the next
// planned session to anyone holding the link, so that's a host decision.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    let code: string | null = null;
    if (action === "enable") {
      code = access.server.statusShareCode ?? (await generateCode());
    } else if (action === "rotate") {
      code = await generateCode();
    } else if (action === "disable") {
      code = null;
    } else {
      return NextResponse.json({ error: "Unknown action — expected enable, rotate or disable" }, { status: 400 });
    }

    const previousCode = access.server.statusShareCode;
    await prisma.server.update({
      where: { id: params.id },
      data: { statusShareCode: code },
    });

    // The public page caches per code for 20s; a rotated-out or disabled
    // code must stop answering immediately, not for one more TTL window.
    if (previousCode && previousCode !== code) clearStatusCache(previousCode);

    // Mirror the change to the hosted status page (realmswap.app/s/<code>).
    // Fire-and-forget — the local page already works; the relay is a bonus.
    if (code) relayStatusSnapshot(params.id, { force: true }).catch(() => {});
    else if (previousCode) removeHostedStatus(previousCode).catch(() => {});

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "STATUS_SHARE",
        details: `${action === "enable" ? "Created" : action === "rotate" ? "Rotated" : "Disabled"} the public status link for ${access.server.name}`,
      },
    }).catch(() => {});

    return NextResponse.json({ code });
  } catch (error: any) {
    console.error("POST /api/servers/[id]/status-share error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
