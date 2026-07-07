// Shared Supabase backend — SEAM ONLY (no-op baseline).
//
// The real client, schema, and typed helpers are owned by a separate effort:
// agent `realmswap-supabase`, branch `feat/supabase-shared-services`. This module
// intentionally does NOT install or import `@supabase/supabase-js` yet — it only
// documents the contract the marketing site's server surface will consume, so the
// rest of the app can import a stable name today without a hard dependency.
//
// When the shared services package lands, replace the body of
// `getSupabaseServerClient()` with a real `createClient(...)` call and swap the
// `SupabaseServerClient` alias for the real client type.

/** Placeholder for the real Supabase client type from the shared package. */
export type SupabaseServerClient = unknown;

/**
 * Returns a server-side Supabase client, or `null` when the backend is not yet
 * configured. Server-only: relies on `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`,
 * which are never exposed to the browser. Today this is always a no-op stub.
 */
export function getSupabaseServerClient(): SupabaseServerClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  // TODO(realmswap-supabase): once `feat/supabase-shared-services` is available,
  // return createClient(url, serviceRoleKey, { auth: { persistSession: false } }).
  // Kept as a stub so the site builds without the shared dependency.
  return null;
}

/** True when the shared-backend env vars are present. Cheap liveness signal. */
export function isBackendConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
