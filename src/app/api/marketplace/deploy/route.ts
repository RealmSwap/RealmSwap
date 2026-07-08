import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkServerSlot } from "@/lib/entitlement";
import { deployTemplate } from "@/lib/templates/installer";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Deploying a template creates a server — enforce the same slot limit.
    const slot = await checkServerSlot(user.id);
    if (!slot.ok) {
      return NextResponse.json(
        {
          error: `You've reached your plan's server limit (${slot.used}/${slot.total} on the ${slot.plan} plan). Upgrade to add more slots.`,
          code: "SLOT_LIMIT",
          used: slot.used,
          total: slot.total,
          plan: slot.plan,
        },
        { status: 403 },
      );
    }

    const { templateId } = await request.json();
    if (!templateId) {
      return NextResponse.json({ error: "Missing templateId" }, { status: 400 });
    }

    const serverId = await deployTemplate(templateId, user.id);

    return NextResponse.json({ success: true, serverId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
