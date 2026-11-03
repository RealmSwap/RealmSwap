import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TemplatePayload } from "./types";

export interface PublishRealmBody {
  name?: string;
  description?: string;
  gameSlug?: string;
  tags?: string | string[];
  payload?: TemplatePayload;
  customDefSpec?: {
    install?: { installScript?: unknown; url?: unknown; appId?: unknown };
    launch?: { launchScript?: unknown };
  } | null;
  realmId?: string;
  version?: string;
  changelog?: string | null;
}

/**
 * Publish (or version) a realm in the cloud marketplace. Shared by the
 * marketplace publish route (authoring from the config editor) and the
 * publish-from-server route (whole-server extraction) — one security posture:
 * script bans, app-side secret scrub, DB guard as the second layer.
 */
export async function publishRealm(body: PublishRealmBody, userId: string) {
  const { name, description, gameSlug, tags, payload, customDefSpec, realmId, version, changelog } = body;

  if (!payload) {
    return { status: 400, json: { error: "Missing payload" } };
  }

  if (customDefSpec) {
    if (customDefSpec.install?.installScript) {
      return { status: 400, json: { error: "Marketplace definitions cannot contain 'installScript' for security reasons. Please use a data-only blueprint." } };
    }
    if (customDefSpec.launch?.launchScript) {
      return { status: 400, json: { error: "Marketplace definitions cannot contain 'launchScript' for security reasons. Please use executable and args." } };
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

  const supabase = await createClient();

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
    if (error) return { status: 400, json: { error: error.message } };
    return { status: 200, json: { id: realmId, version: (ver as { version?: string })?.version, strippedSecrets } };
  }

  // Create a NEW realm + its first version.
  if (!name || !description || !gameSlug) {
    return { status: 400, json: { error: "Missing required fields" } };
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
      seller_id: userId,
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
    return { status: 500, json: { error: error.message } };
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

  return { status: 200, json: { id: realm.id, name: realm.name, strippedSecrets } };
}

/**
 * Convenience wrapper for routes: runs auth, then publishRealm.
 */
export async function publishRealmFromRequest(body: PublishRealmBody) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { status: 401, json: { error: "Unauthorized" } };
  }
  return publishRealm(body, user.id);
}

// NextResponse helper so routes stay one-liners.
export function publishResponse(result: { status: number; json: Record<string, unknown> }) {
  return NextResponse.json(result.json, { status: result.status });
}
