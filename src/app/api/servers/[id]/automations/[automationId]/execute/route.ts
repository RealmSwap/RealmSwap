import { NextResponse } from "next/server";
import { executeAutomation } from "@/lib/actionScheduler";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: { id: string; automationId: string } }
) {
  try {
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
