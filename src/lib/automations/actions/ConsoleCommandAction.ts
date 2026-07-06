import { AutomationActionInterface, AutomationContext } from "../types";
import { getRunner } from "../../runners";

export class ConsoleCommandAction implements AutomationActionInterface {
  id = "CONSOLE_COMMAND";
  name = "Run Console Command";
  description = "Sends a command directly to the server console.";

  async execute(context: AutomationContext, config: any): Promise<void> {
    const command = config?.command;
    if (!command) {
      await context.log("No command provided in config.");
      return;
    }
    await context.log(`Running console command: ${command}`);
    const runner = getRunner(context.server.runnerType);
    await runner.sendCommand(context.server, command);
  }
}
