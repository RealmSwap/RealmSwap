import { ServerRunner } from "./types";
import { LocalWindowsRunner } from "./LocalWindowsRunner";
import { DockerRunner } from "./DockerRunner";

const localWindowsRunner = new LocalWindowsRunner();
const dockerRunner = new DockerRunner();

export function getRunner(runnerType: string): ServerRunner {
  if (runnerType === "DOCKER") {
    return dockerRunner;
  }
  
  // Default to local windows
  return localWindowsRunner;
}
