import { NextRequest, NextResponse } from "next/server";
import { publishRealmFromRequest, publishResponse, PublishRealmBody } from "@/lib/templates/publishRealm";

// POST /api/marketplace/publish
//
// Hand-authored publishing (Config Editor → Publish). The whole security and
// cloud posture lives in lib/templates/publishRealm.ts, shared with the
// publish-from-server route. Body: { name, description, gameSlug, tags,
// payload, customDefSpec?, realmId?, version?, changelog? }.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PublishRealmBody;
    const result = await publishRealmFromRequest(body);
    return publishResponse(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
