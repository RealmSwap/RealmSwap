export type RunnerType = "LOCAL" | "DOCKER";

/** Decide the runner to persist. DOCKER requires an explicit request, a container
 *  definition for the game, and a reachable daemon; otherwise we fall back to LOCAL. */
export function resolveRunnerType(
  requested: string | undefined,
  opts: { hasContainer: boolean; dockerAvailable: boolean },
): RunnerType {
  if (requested === "DOCKER" && opts.hasContainer && opts.dockerAvailable) return "DOCKER";
  return "LOCAL";
}
