import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Start a Stripe Checkout for a subscription plan. Proxies to the
 * create-checkout-session Edge Function with the user's JWT (the function holds
 * the Stripe secret; the app never does). Returns the Checkout URL to open.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { priceId } = await req.json().catch(() => ({}));
  if (!priceId) return NextResponse.json({ error: "priceId is required" }, { status: 400 });

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "No active session" }, { status: 401 });

  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    body: { price_id: priceId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not start checkout. Is billing configured?" },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: (data as { url?: string })?.url });
}
