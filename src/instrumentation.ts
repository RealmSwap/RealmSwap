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

    // Clear any ServerTelemetry backlog from before the 7-day retention
    // prune existed (throttled inside; the boot call is the forced first run).
    const { maybePruneTelemetry } = await import("@/lib/telemetryRetention");
    maybePruneTelemetry();

    // Docker containers outlive this process — reattach log followers, exit
    // watchers, and monitoring (or mark containers that are gone as stopped).
    const { getRunner } = await import("@/lib/runners");
    (getRunner("DOCKER") as import("@/lib/runners/DockerRunner").DockerRunner)
      .reconcileOnBoot()
      .catch((err: any) => console.error("[Docker] boot reconcile failed:", err?.message));

    // Remote-node servers also outlive this process: their containers run on
    // the agent, which keeps reporting. Restart the dashboard-side monitors
    // (they read agent-reported stats from the rows).
    const { prisma } = await import("@/lib/db");
    const { startMonitoring } = await import("@/lib/processMonitor");
    const remoteServers = await prisma.server.findMany({
      where: { runnerType: "AGENT", status: { in: ["RUNNING", "STARTING"] } },
    }).catch(() => []);
    for (const server of remoteServers) startMonitoring(server);
  }
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0, // crash reporting only, no perf overhead
  });
}
