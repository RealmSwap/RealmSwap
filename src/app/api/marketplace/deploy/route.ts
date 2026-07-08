import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkServerSlot } from "@/lib/entitlement";
import { createClient } from "@/lib/supabase/server";
import { deployTemplate, DeployableTemplate } from "@/lib/templates/installer";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Deploying a realm creates a server — enforce the plan slot limit.
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

    const supabase = createClient();

    // Fetch the realm from the cloud marketplace (RLS: published/public only).
    const { data: realm, error: realmErr } = await supabase
      .from("realms")
      .select("id, name, game_slug, payload, custom_def_spec")
      .eq("id", templateId)
      .maybeSingle();
    if (realmErr || !realm) {
      return NextResponse.json({ error: "Realm not found" }, { status: 404 });
    }

    // Record the acquisition in the cloud: ownership + transaction + download bump
    // (idempotent; rejects paid/unpublished realms).
    const { error: acqErr } = await supabase.rpc("acquire_realm", { p_realm_id: templateId });
    if (acqErr) {
      return NextResponse.json({ error: acqErr.message }, { status: 400 });
    }

    // Install locally from the cloud payload.
    const serverId = await deployTemplate(
      {
        id: realm.id,
        name: realm.name,
        gameSlug: realm.game_slug,
        payload: realm.payload as DeployableTemplate["payload"],
        customDefSpec: realm.custom_def_spec,
      },
      user.id,
    );

    return NextResponse.json({ success: true, serverId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
