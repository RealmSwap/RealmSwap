import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isBillingEnabled } from "@/lib/billing";
import BillingView from "@/components/BillingView";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  // Billing is behind a feature flag until a real Stripe account is set up.
  if (!isBillingEnabled()) redirect("/dashboard");

  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  // Plan catalogue is public-read from the cloud (kept in sync from Stripe by the
  // webhook). Free users simply have no matching price row.
  const supabase = createClient();
  const { data: prices } = await supabase
    .from("prices")
    .select("id, unit_amount, currency, interval, plan, active_slots")
    .eq("active", true)
    .order("unit_amount", { ascending: true });

  return (
    <BillingView
      plans={prices ?? []}
      currentPlan={user.subscription?.plan ?? "FREE"}
      currentSlots={user.subscription?.activeSlots ?? null}
    />
  );
}
