import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isBillingEnabled } from "@/lib/billing";

/**
 * Open the Stripe Customer Portal (manage / cancel / update card). Proxies to the
 * create-portal-session Edge Function with the user's JWT. Returns the portal URL.
 */
export async function POST() {
  if (!isBillingEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "No active session" }, { status: 401 });

  const { data, error } = await supabase.functions.invoke("create-portal-session", {
    body: {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not open the billing portal. Do you have an active subscription?" },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: (data as { url?: string })?.url });
}
