/**
 * Decides which path the desktop app should open to on launch.
 *
 * - Authenticated (valid session, user still exists) -> the dashboard.
 * - Otherwise, if any users exist -> the login page.
 * - Otherwise (fresh install, no users) -> the register page.
 *
 * Pure function so the branching is unit-testable without a server/DB; the
 * /start server component wires real cookie + DB data into it.
 */
export function pickEntryPath(input: {
  isAuthenticated: boolean;
  userCount: number;
}): "/dashboard" | "/login" | "/register" {
  if (input.isAuthenticated) return "/dashboard";
  return input.userCount > 0 ? "/login" : "/register";
}
