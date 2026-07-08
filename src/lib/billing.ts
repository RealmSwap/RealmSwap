/**
 * Feature flag for the Stripe billing surface (billing page + /api/billing/*).
 *
 * OFF by default so the app ships with no billing UI or checkout endpoints until a
 * real Stripe account exists. Set BILLING_ENABLED=true (env) to turn it on. Any
 * future nav link to /dashboard/billing should also be gated on this helper.
 */
export function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true";
}
