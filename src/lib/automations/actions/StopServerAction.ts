import { AutomationActionInterface, AutomationContext } from "../types";
import { getRunner } from "../../runners";

export class StopServerAction implements AutomationActionInterface {
  id = "STOP_SERVER";
  name = "Stop Server";
  description = "Stops the server gracefully.";

  async execute(context: AutomationContext, config: any): Promise<void> {
    await context.log("Initiating StopServerAction...");
    const runner = getRunner(context.server.runnerType);
    if (context.server.status === "STOPPED") {
      await context.log("Server is already stopped, skipping.");
      return;
    }
    await runner.stop(context.server);
    await context.log("Server stopped.");
  }
}
