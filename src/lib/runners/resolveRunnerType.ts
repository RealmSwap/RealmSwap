export type RunnerType = "LOCAL" | "DOCKER" | "AGENT";

export interface ResolveRunnerOptions {
  hasContainer: boolean;
  dockerAvailable: boolean;
  /** AGENT: the requested node must exist and have completed enrollment. */
  nodeEnrolled?: boolean;
}

/** Decide the runner to persist. DOCKER requires an explicit request, a container
 *  definition for the game, and a reachable daemon; AGENT requires an explicit
 *  request naming an enrolled node AND a game with a container plan — without
 *  that check a non-container game would deploy "successfully" and only fail
 *  at first START; otherwise we fall back to LOCAL. */
export function resolveRunnerType(
  requested: string | undefined,
  opts: ResolveRunnerOptions,
): RunnerType {
  if (requested === "AGENT" && opts.nodeEnrolled && opts.hasContainer) return "AGENT";
  if (requested === "DOCKER" && opts.hasContainer && opts.dockerAvailable) return "DOCKER";
  return "LOCAL";
}
