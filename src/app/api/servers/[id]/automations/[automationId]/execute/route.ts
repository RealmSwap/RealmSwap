import { NextResponse } from "next/server";
import { executeAutomation } from "@/lib/actionScheduler";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; automationId: string }> }
) {
  const params = await props.params;
  try {
    // Executing an automation runs arbitrary configured actions (restart,
    // console commands) — same bar as creating one.
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) return NextResponse.json({ error: "Requires ADMIN role" }, { status: 403 });

    // Verify it exists and belongs to the server
    const exists = await prisma.automation.findUnique({
      where: { id: params.automationId, serverId: params.id }
    });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Execute in the background
    executeAutomation(params.automationId).catch(err => {
      console.error(`Manual execution error for ${params.automationId}:`, err);
    });

    return NextResponse.json({ success: true, message: "Execution started" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
