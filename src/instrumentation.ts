/**
 * Server-side Sentry bootstrap (Next 14 instrumentation hook).
 *
 * Completely inert unless SENTRY_DSN is set — zero overhead, no outbound
 * traffic, nothing initialised — so the default local/dev experience is
 * unchanged. Set SENTRY_DSN (server) and NEXT_PUBLIC_SENTRY_DSN (client) to
 * activate crash reporting for a deployment.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // After a crash/force-quit the DB still claims live tunnels and playit
    // agents may be orphaned — reset both before anything trusts them.
    const { reconcileTunnelsOnBoot } = await import("@/lib/tunnels");
    reconcileTunnelsOnBoot();
  }
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0, // crash reporting only, no perf overhead
  });
}
