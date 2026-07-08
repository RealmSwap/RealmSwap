import type { SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export type Entitlement = { plan: string; activeSlots: number; isActive: boolean };
export type SlotCheck = { ok: boolean; used: number; total: number; plan: string };

/**
 * Free-tier server allowance. Defaults high so the entitlement gate is fully
 * built and enforced but effectively DORMANT until real (paid) entitlements exist
 * in the cloud — or until this number is tightened. Override via env, e.g.
 * FREE_TIER_SLOTS=1, to switch on a strict freemium cap without a code change.
 */
export const FREE_TIER_SLOTS = Number(process.env.FREE_TIER_SLOTS ?? 999);

const FREE_ENTITLEMENT: Entitlement = {
  plan: "FREE",
  activeSlots: FREE_TIER_SLOTS,
  isActive: false,
};

/**
 * Read the current user's entitlement from the cloud `user_entitlements` view
 * (RLS-scoped to their own row). Falls back to the free tier when there is no
 * active subscription or the cloud is unreachable.
 *
 * Pass an already-authenticated client (e.g. right after signInWithPassword) so
 * the session is read from memory — within a single request the freshly-set auth
 * cookies are not yet on the incoming request.
 */
export async function getEntitlement(client?: SupabaseClient): Promise<Entitlement> {
  try {
    const supabase = client ?? createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return FREE_ENTITLEMENT;

    const { data, error } = await supabase
      .from("user_entitlements")
      .select("plan, active_slots, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) return FREE_ENTITLEMENT;
    return {
      plan: data.plan ?? "FREE",
      activeSlots: data.active_slots ?? FREE_TIER_SLOTS,
      isActive: !!data.is_active,
    };
  } catch {
    return FREE_ENTITLEMENT;
  }
}

/**
 * Upsert the local Subscription mirror to match an entitlement, so the dashboard
 * (which reads `subscription.activeSlots`) reflects reality. Called on login.
 */
export async function syncEntitlementToMirror(userId: string, ent: Entitlement) {
  const status = ent.isActive ? "ACTIVE" : "FREE";
  await prisma.subscription.upsert({
    where: { userId },
    update: { plan: ent.plan, activeSlots: ent.activeSlots, status },
    create: { userId, plan: ent.plan, activeSlots: ent.activeSlots, status },
  });
}

/**
 * Whether the user may create another server under their entitlement. Counts the
 * servers they own (archived servers are separate and don't count).
 */
export async function checkServerSlot(userId: string): Promise<SlotCheck> {
  const [ent, used] = await Promise.all([
    getEntitlement(),
    prisma.server.count({ where: { userId } }),
  ]);
  return { ok: used < ent.activeSlots, used, total: ent.activeSlots, plan: ent.plan };
}
