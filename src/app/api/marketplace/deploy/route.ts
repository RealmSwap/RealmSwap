import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkServerSlot } from "@/lib/entitlement";
import { createClient } from "@/lib/supabase/server";
import { createRealmServerShell } from "@/lib/templates/installer";

// POST /api/marketplace/deploy  { templateId, versionId?, installId? }
//
// Phase 1 of a realm deploy: record the acquisition (acquire_realm RPC:
// ownership + download bump, idempotent) and create the server shell —
// definition, params, config overrides. Fast, so the client learns the
// serverId immediately and can subscribe to progress.
//
// v1 payloads are DONE at this point (historic placeholder behavior).
// v2 payloads return `materialize` instructions: the client then subscribes
// to the progress SSE and POSTs /api/servers/[id]/realm-materialize, which
// downloads real files through the verified pipeline (loader → pack → mods →
// boot test → rollback-on-failure, deleting the server on failure).
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

    const supabase = await createClient();

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
    const shell = await createRealmServerShell(
      {
        id: realm.id,
        name: realm.name,
        gameSlug: realm.game_slug,
        payload: payload as Parameters<typeof createRealmServerShell>[0]["payload"],
        customDefSpec,
      },
      user.id,
    );

    // Surface what the materialize phase will run so the client can describe
    // it honestly before kicking off a (possibly minutes-long) verified install.
    const p = (payload ?? {}) as { mods?: unknown[]; modpack?: unknown; loader?: unknown };
    return NextResponse.json({
      success: true,
      serverId: shell.serverId,
      done: !shell.v2,
      materialize: shell.v2
        ? {
            game: shell.gameSlug,
            hasModpack: Boolean(p.modpack),
            modCount: Array.isArray(p.mods) ? p.mods.length : 0,
            hasLoader: Boolean(p.loader),
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
