import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { requireLocalServer } from "@/lib/agents/perimeter";

// GET: per-server secrets for the SFTP panel. Kept out of the shared
// servers-list payload and owner-only — team members never receive them, and
// ADMIN-ranked collaborators don't either (the role exists for managing a
// live server, not for reading its credentials).
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access || !access.isOwner) {
      return NextResponse.json({ error: "Only the server owner can view server secrets" }, { status: 403 });
    }
    requireLocalServer(access.server, "The SFTP panel");

    return NextResponse.json({
      sftpPassword: access.server.sftpPassword ?? null,
    });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/secrets error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
