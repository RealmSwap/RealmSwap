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

    const { templateId, versionId } = await request.json();
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

    // Deploy a specific past version if requested; otherwise the realm's current.
    let payload = realm.payload;
    let customDefSpec = realm.custom_def_spec;
    if (versionId) {
      const { data: ver, error: verErr } = await supabase
        .from("realm_versions")
        .select("payload, custom_def_spec, realm_id")
        .eq("id", versionId)
        .maybeSingle();
      if (verErr || !ver || ver.realm_id !== templateId) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
      payload = ver.payload;
      customDefSpec = ver.custom_def_spec;
    }

    // Record the acquisition in the cloud: ownership + transaction + download bump
    // (idempotent; rejects paid/unpublished realms).
    const { error: acqErr } = await supabase.rpc("acquire_realm", { p_realm_id: templateId });
    if (acqErr) {
      return NextResponse.json({ error: acqErr.message }, { status: 400 });
    }

    // Install locally from the chosen payload.
    const serverId = await deployTemplate(
      {
        id: realm.id,
        name: realm.name,
        gameSlug: realm.game_slug,
        payload: payload as DeployableTemplate["payload"],
        customDefSpec,
      },
      user.id,
    );

    return NextResponse.json({ success: true, serverId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
