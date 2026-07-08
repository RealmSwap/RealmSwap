import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { FREE_TIER_SLOTS } from "@/lib/entitlement";
import type { User as SupabaseUser } from "@supabase/supabase-js";

/**
 * Identity is owned by Supabase Auth. The local SQLite `User` row is a thin
 * MIRROR keyed by the Supabase user id, so local foreign keys (Server.userId,
 * ActivityLog.userId, ...) keep working unchanged.
 *
 * This module preserves the public contract it had under the old bcrypt/JWT
 * scheme: `getAuthenticatedUser()` returns the local user (with `subscription`,
 * secrets stripped) or null. ~85 call sites across the app depend on that shape,
 * so it must not change.
 */

function displayNameFor(u: SupabaseUser): string {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  return (
    (meta.full_name as string) ||
    (meta.name as string) ||
    (u.email ? u.email.split("@")[0] : "Player")
  );
}

/**
 * Create or refresh the local mirror for a Supabase user. Idempotent.
 *
 * - The first local user becomes ADMIN. This is a LOCAL-only role for now; cloud
 *   `profiles.role` is service-role-locked by design and managed separately.
 * - Ensures a local `Subscription` mirror exists so the dashboard's slot display
 *   keeps working until entitlement is wired to the cloud (Phase 2).
 */
export async function ensureLocalUser(supabaseUser: SupabaseUser) {
  const email = (supabaseUser.email ?? "").toLowerCase();
  const name = displayNameFor(supabaseUser);

  const existing = await prisma.user.findUnique({
    where: { id: supabaseUser.id },
    include: { subscription: true },
  });

  if (existing) {
    if (existing.email !== email || existing.name !== name) {
      await prisma.user.update({
        where: { id: supabaseUser.id },
        data: { email: email || existing.email, name },
      });
    }
    return prisma.user.findUnique({
      where: { id: supabaseUser.id },
      include: { subscription: true },
    });
  }

  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "ADMIN" : "USER";

  await prisma.user.create({
    data: {
      id: supabaseUser.id,
      email,
      name,
      role,
      passwordHash: "", // legacy column; identity is owned by Supabase Auth
      subscription: {
        // Seed the mirror at the free-tier default; login syncs it from cloud
        // entitlement (user_entitlements) once a plan exists.
        create: { plan: "FREE", status: "FREE", activeSlots: FREE_TIER_SLOTS },
      },
    },
  });

  return prisma.user.findUnique({
    where: { id: supabaseUser.id },
    include: { subscription: true },
  });
}

/**
 * Resolve the current user from the Supabase session cookie and return the local
 * mirror (lazily creating it if missing — self-heals after a reinstall). Returns
 * null when unauthenticated. Same return shape as the previous JWT implementation.
 */
export async function getAuthenticatedUser() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    let local = await prisma.user.findUnique({
      where: { id: user.id },
      include: { subscription: true },
    });
    if (!local) local = await ensureLocalUser(user);
    if (!local) return null;

    // Don't leak the (now-legacy, usually null) password hash.
    const { passwordHash, ...safeUser } = local;
    return safeUser;
  } catch (error) {
    return null;
  }
}
