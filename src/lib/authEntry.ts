/**
 * Decides which path the desktop app should open to on launch.
 *
 * - Authenticated (valid Supabase session) -> the dashboard.
 * - Otherwise -> the login page (register is reachable from there).
 *
 * With cloud (Supabase) auth, accounts are global rather than rows in the local
 * DB, so the old "any local users exist?" heuristic no longer applies — a fresh
 * install simply shows login.
 *
 * Pure function so the branching is unit-testable without a server/session; the
 * /start server component wires the real session state into it.
 */
export function pickEntryPath(input: {
  isAuthenticated: boolean;
}): "/dashboard" | "/login" {
  return input.isAuthenticated ? "/dashboard" : "/login";
}
