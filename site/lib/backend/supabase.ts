import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Marketing-site Supabase access.
//
// The marketing site reads PUBLIC data from the shared Supabase project via the
// anon/publishable key — RLS is the access boundary. The shared backend (schema,
// RLS policies, auth, and any privileged writes) is owned by a separate effort:
// agent `realmswap-supabase`, branch `feat/supabase-shared-services`. This app
// only reads public rows from the same project; it does not own the schema.

/** True when the public (anon) Supabase env is present. */
export function isBackendConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let cachedPublicClient: SupabaseClient | null = null;

/**
 * Anon Supabase client for PUBLIC reads, or `null` when the env is not
 * configured. The anon/publishable key is safe to expose; RLS restricts what it
 * can read. Cached per server instance. No auth session is used.
 */
export function getPublicSupabaseClient(): SupabaseClient | null {
  if (!isBackendConfigured()) return null;
  if (!cachedPublicClient) {
    cachedPublicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cachedPublicClient;
}

// --- Server-only (service-role) seam — still a no-op stub. -------------------
// For FUTURE privileged writes (e.g. lead capture). Relies on server-only
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, never exposed to the browser. The
// real implementation is owned by the realmswap-supabase effort.

/** Placeholder for the real service-role client type from the shared package. */
export type SupabaseServerClient = unknown;

export function getSupabaseServerClient(): SupabaseServerClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  // TODO(realmswap-supabase): return a real service-role client here.
  return null;
}
