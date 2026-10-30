import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { verifySupabaseTokenLocal } from "@/lib/supabase/verifyLocal";
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
      try {
        await prisma.user.update({
          where: { id: supabaseUser.id },
          data: { email: email || existing.email, name },
        });
      } catch (err: any) {
        if (err?.code !== "P2002") throw err;
        // Another mirror row already holds that email (e.g. a Supabase-side
        // email change onto an address that exists locally). Keep the account
        // working: refresh the name, keep the old address.
        await prisma.user.update({
          where: { id: supabaseUser.id },
          data: { name },
        });
      }
    }
    return prisma.user.findUnique({
      where: { id: supabaseUser.id },
      include: { subscription: true },
    });
  }

  // Re-link a pre-Supabase local account. Older builds keyed the local User row
  // by a bcrypt-era cuid; on the user's first Supabase login the id lookup above
  // misses, and a naive create then collides on the unique email — a hard 500 on
  // login for every upgrading user. Instead, re-key the legacy row to the Supabase
  // id. Every FK to User.id is ON UPDATE CASCADE (and SQLite foreign_keys is ON),
  // so the user's servers/subscription/logs follow the id automatically.
  //
  // The lookup is case-insensitive: legacy rows predate consistent lowercasing,
  // and an exact-match miss here forked a duplicate account that stranded the
  // user's servers on an orphan row (recoverable only by hand-edited scripts).
  if (email) {
    const legacyRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User" WHERE lower("email") = ${email} AND "id" <> ${supabaseUser.id} LIMIT 1
    `;
    const legacy = legacyRows[0];
    if (legacy) {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "id" = ? WHERE "id" = ?`,
        supabaseUser.id,
        legacy.id,
      );
      try {
        await prisma.user.update({
          where: { id: supabaseUser.id },
          data: { email, name },
        });
      } catch (err: any) {
        if (err?.code !== "P2002") throw err;
        await prisma.user.update({ where: { id: supabaseUser.id }, data: { name } });
      }
      return prisma.user.findUnique({
        where: { id: supabaseUser.id },
        include: { subscription: true },
      });
    }
  }

  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "ADMIN" : "USER";

  try {
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
  } catch (err: any) {
    if (err?.code !== "P2002") throw err;
    // Lost a first-login race (the dashboard fires several parallel requests
    // right after signup, each resolving the session). The winner created the
    // mirror — return it instead of surfacing a spurious 500/401.
    const winner = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
      include: { subscription: true },
    });
    if (winner) return winner;
    throw err;
  }

  return prisma.user.findUnique({
    where: { id: supabaseUser.id },
    include: { subscription: true },
  });
}

async function localMirrorFor(supabaseUser: SupabaseUser) {
  let local = await prisma.user.findUnique({
    where: { id: supabaseUser.id },
    include: { subscription: true },
  });
  if (!local) local = await ensureLocalUser(supabaseUser);
  if (!local) return null;
  // Don't leak the (now-legacy, usually null) password hash.
  const { passwordHash, ...safeUser } = local;
  return safeUser;
}

/**
 * Resolve the current user from the Supabase session cookie and return the local
 * mirror (lazily creating it if missing — self-heals after a reinstall). Returns
 * null when unauthenticated. Same return shape as the previous JWT implementation.
 *
 * Errors are information: a local database failure throws (the routes' handlers
 * surface it as a 500) instead of masquerading as "logged out", which used to
 * kick users into re-login flows during transient hiccups. Only "no valid
 * session" returns null.
 */
export async function getAuthenticatedUser() {
  const supabase = await createClient();

  // Fast, offline-capable path: verify the session's access token locally
  // (HS256 against SUPABASE_JWT_SECRET). With no internet, this is the only
  // thing standing between the user and a bricked dashboard while their game
  // servers keep running.
  let session: { access_token: string } | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session as { access_token: string } | null;
  } catch {
    session = null; // unreadable cookie — let the online path decide
  }
  if (session?.access_token) {
    const payload = verifySupabaseTokenLocal(session.access_token);
    if (payload?.sub) {
      return localMirrorFor({
        id: payload.sub,
        email: payload.email,
        user_metadata: payload.user_metadata ?? {},
      } as SupabaseUser);
    }
  }

  // Online path: no local verification possible (secret unconfigured) or the
  // token is expired/invalid and needs a refresh.
  let supabaseUser: SupabaseUser | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    supabaseUser = user;
  } catch {
    // Supabase unreachable (offline, outage): the session can't be validated
    // right now — that's "unauthenticated for the moment", not a server error.
    return null;
  }
  if (!supabaseUser) return null;
  return localMirrorFor(supabaseUser);
}
