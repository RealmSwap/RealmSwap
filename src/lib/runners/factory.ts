import { ServerRunner } from "./types";
import { LocalRunner } from "./LocalRunner";
import { DockerRunner } from "./DockerRunner";

const localRunner = new LocalRunner();
const dockerRunner = new DockerRunner();

export function getRunner(runnerType: string): ServerRunner {
  if (runnerType === "DOCKER") {
    return dockerRunner;
  }
  
  // Default to local windows
  return localRunner;
}
