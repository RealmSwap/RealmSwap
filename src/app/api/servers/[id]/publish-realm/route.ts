import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { buildRealmPayloadFromServer } from "@/lib/templates/extract";
import { publishRealm, PublishRealmBody } from "@/lib/templates/publishRealm";

// POST /api/servers/[id]/publish-realm
// Body: { name, description, tags?, version?, changelog?, realmId? }
//
// "Publish this server as a Realm": build the v2 payload from the server's
// LIVE state (pack reference, loader marker, pinned mods, startup params) and
// publish it to the cloud marketplace. The metadata (name/description/tags)
// comes from the caller; the payload comes from the machine — callers cannot
// hand-craft a payload through this route.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await verifyServerAccess(params.id, user.id, "ADMIN");
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions (Requires ADMIN)" }, { status: 403 });
    }
    const { server } = access;

    const body = await req.json();
    const name = (body.name || server.name.replace(/\s*-\s*Deployed$/, "")).toString().slice(0, 80);
    const description = (body.description || `Deploy '${name}' — the exact setup from a working RealmSwap server, boot-tested on deploy.`).toString().slice(0, 500);

    let extracted;
    try {
      extracted = await buildRealmPayloadFromServer(params.id);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // A server for a game RealmSwap doesn't ship runs on its owner's own game
    // definition. The realm has to carry that definition, or nobody else
    // could deploy it; publishRealm puts it through the shared-definition gate.
    let customDefSpec: PublishRealmBody["customDefSpec"] = null;
    if (server.definitionId) {
      const def = await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } });
      if (def && def.ownerId !== null) {
        if (def.installMethod === "CUSTOM_SCRIPT") {
          return NextResponse.json(
            { error: "This server runs a script-based custom game. Shared realms can't include scripts, so it can't be published." },
            { status: 400 },
          );
        }
        customDefSpec = {
          ...JSON.parse(def.spec),
          name: def.displayName.slice(0, 80),
          ...(def.description ? { description: def.description.slice(0, 500) } : {}),
          ...(def.icon.length <= 16 ? { icon: def.icon } : {}),
          recommendedRamGB: Math.min(256, Math.max(1, def.recommendedRamGB)),
        };
      }
    }

    const publishBody: PublishRealmBody = {
      name,
      description,
      gameSlug: server.game,
      tags: typeof body.tags === "string" && body.tags.trim() ? body.tags : `${server.game},Community`,
      payload: extracted.payload,
      customDefSpec,
      realmId: body.realmId,
      version: body.version || "1.0.0",
      changelog: body.changelog ?? null,
    };

    const result = await publishRealm(publishBody, user.id);
    if (result.status !== 200) {
      return NextResponse.json(result.json, { status: result.status });
    }
    return NextResponse.json({
      ...result.json,
      warnings: extracted.warnings,
      summary: {
        modCount: extracted.payload.mods.length,
        hasModpack: Boolean(extracted.payload.modpack),
        loader: extracted.payload.loader?.type ?? null,
      },
    });
  } catch (error: any) {
    console.error("POST publish-realm error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
