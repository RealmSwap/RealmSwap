import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getEntitlement, syncEntitlementToMirror } from "@/lib/entitlement";

/**
 * Re-read the user's entitlement from the cloud and sync the local mirror. Called
 * by the billing page after returning from Checkout (the webhook writes the
 * subscription asynchronously, so the page polls this until the plan updates).
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ent = await getEntitlement();
  await syncEntitlementToMirror(user.id, ent);
  return NextResponse.json({ entitlement: ent });
}
