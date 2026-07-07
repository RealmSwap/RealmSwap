// Supabase Edge Function: create-checkout-session
//
// Called by the desktop app (with the signed-in user's Supabase JWT) to start a
// Stripe Checkout for a subscription plan. Returns a Checkout URL the app opens in
// the user's browser. The resulting subscription is written back by the
// stripe-webhook function — never by the client.
//
// Config: `verify_jwt = true` in supabase/config.toml (platform verifies the
// caller's Supabase JWT before invoking).
//
// Required function secrets: STRIPE_SECRET_KEY (SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected by the platform).
//
// Body: { price_id: string, success_url?: string, cancel_url?: string }

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

  // Identify the caller from their JWT (anon key + forwarded Authorization).
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return new Response("unauthorized", { status: 401 });

  const { price_id, success_url, cancel_url } = await req.json().catch(() => ({}));
  if (!price_id) return new Response("price_id required", { status: 400 });

  // service_role client to read/write the customer mapping.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Ensure a Stripe customer exists for this user.
  let stripeCustomerId: string;
  const { data: existing } = await admin
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    stripeCustomerId = existing.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    stripeCustomerId = customer.id;
    await admin
      .from("customers")
      .upsert({ id: user.id, stripe_customer_id: stripeCustomerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: price_id, quantity: 1 }],
    success_url: success_url ?? DEFAULT_RETURN,
    cancel_url: cancel_url ?? DEFAULT_RETURN,
    allow_promotion_codes: true,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
