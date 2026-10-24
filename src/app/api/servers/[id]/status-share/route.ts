import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
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
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    await prisma.server.update({
      where: { id: params.id },
      data: { statusShareCode: code },
    });

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
