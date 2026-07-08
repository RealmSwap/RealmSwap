import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, gameSlug, tags, payload, customDefSpec, realmId, version, changelog } = body;

    if (!payload) {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    if (customDefSpec) {
      if (customDefSpec.install?.installScript) {
        return NextResponse.json({ error: "Marketplace definitions cannot contain 'installScript' for security reasons. Please use a data-only blueprint." }, { status: 400 });
      }
      if (customDefSpec.launch?.launchScript) {
        return NextResponse.json({ error: "Marketplace definitions cannot contain 'launchScript' for security reasons. Please use executable and args." }, { status: 400 });
      }
    }

    // Best-effort app-side scrub of accidental secrets in config overrides (the DB
    // guard / publish RPC scrub again server-side; both are idempotent).
    let strippedSecrets = false;
    if (payload.configOverrides && Array.isArray(payload.configOverrides)) {
      for (const override of payload.configOverrides) {
        if (override.content && typeof override.content === "string") {
          const newContent = override.content.replace(/(password|token|key|secret)\s*[:=]\s*[^\s\n"']+/gi, "$1=***REMOVED***");
          if (newContent !== override.content) {
            strippedSecrets = true;
            override.content = newContent;
          }
        }
      }
    }

    const supabase = createClient();

    // Publish a NEW VERSION of an existing realm (ownership enforced in the RPC,
    // which also syncs the realm's current payload/version).
    if (realmId) {
      const { data: ver, error } = await supabase.rpc("publish_realm_version", {
        p_realm_id: realmId,
        p_version: version || "1.0.0",
        p_payload: payload,
        p_custom_def_spec: customDefSpec ?? null,
        p_changelog: changelog ?? null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ id: realmId, version: (ver as { version?: string })?.version, strippedSecrets });
    }

    // Create a NEW realm + its first version.
    if (!name || !description || !gameSlug) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const tagsArr =
      typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : Array.isArray(tags)
        ? tags
        : [];

    const { data: realm, error } = await supabase
      .from("realms")
      .insert({
        seller_id: user.id,
        name,
        description,
        game_slug: gameSlug,
        tags: tagsArr,
        payload,
        custom_def_spec: customDefSpec ?? null,
        version: version || "1.0.0",
        status: "PUBLISHED",
        visibility: "PUBLIC",
        verified_level: "UNVERIFIED",
      })
      .select("id, name, payload, custom_def_spec, version")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // First version snapshot — use the realm's stored (guard-scrubbed) payload so
    // history matches the listing exactly.
    await supabase.from("realm_versions").insert({
      realm_id: realm.id,
      version: realm.version,
      payload: realm.payload,
      custom_def_spec: realm.custom_def_spec ?? null,
      changelog: changelog ?? null,
    });

    return NextResponse.json({ id: realm.id, name: realm.name, strippedSecrets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
