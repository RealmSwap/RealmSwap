// Supabase Edge Function: stripe-webhook
//
// The TRUSTED billing writer. Runs on Supabase (Deno), NOT in the desktop app, so
// it is the only place that holds the Stripe secret + the service_role key (which
// bypasses RLS). Stripe POSTs lifecycle events here; we verify the signature and
// project them into public.customers / public.subscriptions, and sync the product
// / price catalogue so user_entitlements and the billing page stay accurate.
//
// Config: verify_jwt = false (Stripe uses its own signature).
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are injected by the platform).

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

async function upsertProduct(p: Stripe.Product) {
  await admin.from("products").upsert({
    id: p.id,
    active: p.active,
    name: p.name,
    description: p.description,
    metadata: p.metadata,
  });
}

async function upsertPrice(price: Stripe.Price) {
  await admin.from("prices").upsert({
    id: price.id,
    product_id: typeof price.product === "string" ? price.product : price.product?.id,
    active: price.active,
    currency: price.currency,
    unit_amount: price.unit_amount,
    interval: price.recurring?.interval ?? null,
    interval_count: price.recurring?.interval_count ?? 1,
    // Plan + slot entitlement live in the Stripe price metadata.
    plan: price.metadata?.plan ?? null,
    active_slots: price.metadata?.active_slots ? Number(price.metadata.active_slots) : null,
    metadata: price.metadata,
  });
}

// Derive our plan + slots for a subscription from the synced prices table.
async function resolveEntitlement(priceId: string | null) {
  if (!priceId) return { plan: null as string | null, activeSlots: 1 };
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

  // Idempotency: record the event id; a duplicate insert means we've handled it.
  const { error: dupErr } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });
  if (dupErr) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case "product.created":
      case "product.updated":
      case "product.deleted":
        await upsertProduct(event.data.object as Stripe.Product);
        break;
      case "price.created":
      case "price.updated":
      case "price.deleted":
        await upsertPrice(event.data.object as Stripe.Price);
        break;
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
      case "customer.subscription.deleted":
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("handler error", err);
    return new Response(`handler error: ${err}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
