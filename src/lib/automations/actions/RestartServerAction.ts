import { AutomationActionInterface, AutomationContext } from "../types";
import { getRunner } from "../../runners";

export class RestartServerAction implements AutomationActionInterface {
  id = "RESTART_SERVER";
  name = "Restart Server";
  description = "Stops and then starts the server.";

  async execute(context: AutomationContext, config: any): Promise<void> {
    await context.log("Initiating RestartServerAction...");
    const runner = getRunner(context.server.runnerType);
    if (context.server.status !== "STOPPED") {
      await context.log("Stopping server for restart...");
      await runner.stop(context.server);
    }
    await context.log("Waiting 5 seconds before starting...");
    await new Promise(r => setTimeout(r, 5000));
    await context.log("Starting server...");
    await runner.start(context.server, null);
    await context.log("Server restarted.");
  }
}
