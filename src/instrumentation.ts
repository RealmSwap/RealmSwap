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
    for (const server of remoteServers) startMonitoring(server, getRunner(server.runnerType));

    // Player sampling + auto-stop evaluation subscribe to the monitor tick
    // via the event bus; wiring it here keeps processMonitor from importing
    // autoStop (which would close an import cycle through the runners).
    const { attachAutoStopSampler } = await import("@/lib/autoStop");
    attachAutoStopSampler();

    // Local Windows servers outlive this process too (Windows does not kill
    // child processes on quit/crash): mark dead ones stopped, reattach
    // monitoring to live ones, and clean up interrupted updates.
    const { reconcileLocalServersOnBoot } = await import("@/lib/runners/localReconcile");
    await reconcileLocalServersOnBoot().catch((err: any) =>
      console.error("[LocalRunner] boot reconcile failed:", err?.message)
    );

    // Dedicated-box mode: servers marked "start with RealmSwap" boot with
    // the app — strictly after the reconcile above, so only genuinely
    // stopped servers are started. Production only: `npm run dev` must not
    // drag game servers up with it.
    if (process.env.NODE_ENV === "production") {
      const { autoStartServersOnLaunch } = await import("@/lib/autoStartOnLaunch");
      autoStartServersOnLaunch()
        .then((result) => {
          if (result.started.length) {
            console.log(`[AutoStart] started ${result.started.length} server(s) marked for launch`);
          }
          for (const f of result.failed) {
            console.error(`[AutoStart] ${f.serverId}: ${f.error}`);
          }
        })
        .catch((err: any) => console.error("[AutoStart] launch pass failed:", err?.message));
    }

    // The dashboard hosts game processes — an unhandled stream error (EPIPE
    // from writing stdin to a just-died server) must not take the whole
    // process down and orphan every running server with it. Log loudly and
    // keep serving.
    process.on("uncaughtException", (err) => console.error("[Uncaught exception, keeping dashboard alive]", err));
    process.on("unhandledRejection", (reason) => console.error("[Unhandled rejection, keeping dashboard alive]", reason));
  }
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0, // crash reporting only, no perf overhead
  });
}
