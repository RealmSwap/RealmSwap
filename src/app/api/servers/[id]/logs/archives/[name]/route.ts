import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { readLogArchive } from "@/lib/serverLogs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Content of one rotated log archive for the console history viewer. The
// archive name is validated against the rotation naming scheme inside
// readLogArchive, so it can never traverse outside the server's log dir.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string; name: string }> }) {
  const params = await props.params;
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await verifyServerAccess(params.id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  try {
    const { content, truncated } = readLogArchive(params.id, params.name);
    return NextResponse.json({ name: params.name, content, truncated });
  } catch (err: any) {
    if (err.message === "Log archive not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("GET /api/servers/[id]/logs/archives/[name] error:", err);
    return NextResponse.json({ error: "Could not read log archive" }, { status: 500 });
  }
}
