// Supabase Edge Function: stripe-webhook
//
// The TRUSTED billing writer. This runs on Supabase infrastructure (Deno), NOT in
// the desktop app, so it is the only place that holds the Stripe secret and the
// Supabase service_role key (which bypasses RLS). Stripe POSTs subscription
// lifecycle events here; we verify the signature and project them into
// public.customers / public.subscriptions, which the app reads back (RLS-gated).
//
// Config: `verify_jwt = false` in supabase/config.toml (Stripe uses its own
// signature, not a Supabase JWT).
//
// Required function secrets (set via `supabase secrets set ...`):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (the last two are injected by the platform)
//
// This is a working skeleton: it covers the core events and the plan/active_slots
// derivation. Harden (retries, partial-failure handling, more event types) before
// production. Pin the import versions to the ones you test with.

import Stripe from "https://esm.sh/stripe@16?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// service_role client — bypasses RLS. Never expose this key to the desktop app.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Derive our plan + slot entitlement from the Stripe price. Prefer explicit price
// metadata (plan / active_slots); fall back to our prices table.
async function resolveEntitlement(priceId: string | null) {
  if (!priceId) return { plan: null, activeSlots: 1 };
  const { data } = await admin
    .from("prices")
    .select("plan, active_slots")
    .eq("id", priceId)
    .maybeSingle();
  return { plan: data?.plan ?? null, activeSlots: data?.active_slots ?? 1 };
}

async function upsertSubscription(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const { plan, activeSlots } = await resolveEntitlement(priceId);

  // Map the Stripe customer to our user via public.customers.
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("stripe_customer_id", sub.customer as string)
    .maybeSingle();
  if (!customer) {
    console.error("no local customer for stripe customer", sub.customer);
    return;
  }

  await admin.from("subscriptions").upsert({
    id: sub.id,
    user_id: customer.id,
    status: sub.status,
    price_id: priceId,
    plan,
    active_slots: activeSlots,
    quantity: sub.items.data[0]?.quantity ?? 1,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
  });
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    return new Response(`signature verification failed: ${err}`, { status: 400 });
  }

  // Idempotency: skip events we've already processed.
  const { error: dupErr } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });
  if (dupErr) {
    // Unique violation => already handled. Ack so Stripe stops retrying.
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      // TODO: product.created/updated + price.created/updated to auto-sync the
      // catalogue into public.products / public.prices.
      default:
        break;
    }
  } catch (err) {
    console.error("handler error", err);
    return new Response(`handler error: ${err}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
