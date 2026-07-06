import { AutomationActionInterface, AutomationContext } from "../types";
import { getRunner } from "../../runners";

export class StartServerAction implements AutomationActionInterface {
  id = "START_SERVER";
  name = "Start Server";
  description = "Starts the server if it is currently offline.";

  async execute(context: AutomationContext, config: any): Promise<void> {
    await context.log("Initiating StartServerAction...");
    const runner = getRunner(context.server.runnerType);
    if (context.server.status === "RUNNING") {
      await context.log("Server is already running, skipping.");
      return;
    }
    await runner.start(context.server, null);
    await context.log("Server started.");
  }
}
