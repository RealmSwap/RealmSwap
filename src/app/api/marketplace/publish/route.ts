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
    const { name, description, gameSlug, tags, payload, customDefSpec } = body;

    if (!name || !description || !gameSlug || !payload) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (customDefSpec) {
      if (customDefSpec.install?.installScript) {
        return NextResponse.json({ error: "Marketplace definitions cannot contain 'installScript' for security reasons. Please use a data-only blueprint." }, { status: 400 });
      }
      if (customDefSpec.launch?.launchScript) {
        return NextResponse.json({ error: "Marketplace definitions cannot contain 'launchScript' for security reasons. Please use executable and args." }, { status: 400 });
      }
    }

    // Best-effort scrub of accidental secrets in config overrides (matches prior
    // behavior). NOTE: enforced app-side only; a DB trigger is future hardening.
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

    const tagsArr =
      typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : Array.isArray(tags)
        ? tags
        : [];

    const supabase = createClient();
    // RLS insert policy requires seller_id = auth.uid() (= the local mirror id).
    // verified_level is forced to UNVERIFIED here; users cannot self-promote.
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
        status: "PUBLISHED",
        visibility: "PUBLIC",
        verified_level: "UNVERIFIED",
      })
      .select("id, name")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: realm.id, name: realm.name, strippedSecrets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
