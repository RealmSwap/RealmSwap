import { ServerRunner } from "./types";
import { LocalRunner } from "./LocalRunner";
import { DockerRunner } from "./DockerRunner";
import { RemoteRunner } from "./RemoteRunner";

const localRunner = new LocalRunner();
const dockerRunner = new DockerRunner();
const remoteRunner = new RemoteRunner();

export function getRunner(runnerType: string): ServerRunner {
  if (runnerType === "DOCKER") {
    return dockerRunner;
  }
  if (runnerType === "AGENT") {
    return remoteRunner;
  }

  // Default to local windows
  return localRunner;
}
