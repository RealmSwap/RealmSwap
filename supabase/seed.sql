-- Seed: subscription catalogue for RealmSwap.
--
-- These rows mirror the Stripe product/price catalogue so the app can render the
-- plan picker before any user has a subscription. The ids below are PLACEHOLDERS.
-- At go-live:
--   1. Create the products/prices in the Stripe dashboard (test mode first).
--   2. Replace the prod_.../price_... ids here with the real ones (or let the
--      Stripe webhook Edge Function sync them automatically on product.* / price.*
--      events, in which case this seed is only for local dev).
--
-- Plan -> active_slots mapping matches the existing local billing mockup:
--   STARTER = 1 slot ($9/mo), PARTY = 2 slots ($19/mo), GUILD = 4 slots ($39/mo).

insert into public.products (id, active, name, description) values
  ('prod_starter_placeholder', true, 'Starter', '1 active server slot'),
  ('prod_party_placeholder',   true, 'Party',   '2 active server slots'),
  ('prod_guild_placeholder',   true, 'Guild',   '4 active server slots')
on conflict (id) do nothing;

insert into public.prices
  (id, product_id, active, currency, unit_amount, interval, plan, active_slots) values
  ('price_starter_placeholder', 'prod_starter_placeholder', true, 'usd',  900, 'month', 'STARTER', 1),
  ('price_party_placeholder',   'prod_party_placeholder',   true, 'usd', 1900, 'month', 'PARTY',   2),
  ('price_guild_placeholder',   'prod_guild_placeholder',   true, 'usd', 3900, 'month', 'GUILD',   4)
on conflict (id) do nothing;
