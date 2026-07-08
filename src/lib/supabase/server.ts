import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client bound to the request's cookies — for Server Components, Route
 * Handlers, and Server Actions.
 *
 * Uses the PUBLIC anon key + the user's session only. This code runs on the end
 * user's machine (Next server embedded in Electron), so it must never hold the
 * service-role key or a direct Postgres connection — RLS is the access boundary.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Thrown when called from a Server Component (cookies are read-only
            // there). Safe to ignore — the middleware refreshes the session.
          }
        },
      },
    },
  );
}
