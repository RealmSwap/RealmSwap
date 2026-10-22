/**
 * Client-side Sentry bootstrap. Called once from the authenticated shell
 * (dashboard layout) — see SettingsView for the consent toggle.
 *
 * Inert unless BOTH the public DSN is configured AND the user opted in
 * (localStorage "rs.crashReports" === "on"). Opt-in keeps reporting off by
 * default, which is the right default for a locally-hosted tool.
 */
export function initClientErrorReporting(): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem("rs.crashReports") !== "on") return;
  if ((window as any).__rsSentryReady) return;

  import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0,
    });
    (window as any).__rsSentryReady = true;
  }).catch(() => {});
}
