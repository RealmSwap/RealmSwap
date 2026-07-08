// Supabase Edge Function: create-portal-session
//
// Called by the desktop app (with the signed-in user's Supabase JWT) to open the
// Stripe Customer Portal (cancel, change plan, update card, view invoices).
// Returns a portal URL the app opens in the OS browser.
//
// Config: verify_jwt = true.
// Secrets: STRIPE_SECRET_KEY (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_ANON_KEY injected by the platform).
//
// Body: { return_url?: string }

import Stripe from "https://esm.sh/stripe@16?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const DEFAULT_RETURN = "realmsync://checkout-callback";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return new Response("unauthorized", { status: 401 });

  const { return_url } = await req.json().catch(() => ({}));

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: customer } = await admin
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!customer?.stripe_customer_id) {
    return new Response(
      JSON.stringify({ error: "No subscription found for this account." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customer.stripe_customer_id,
    return_url: return_url ?? DEFAULT_RETURN,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
