import { AutomationActionInterface, AutomationContext } from "../types";

export class WaitAction implements AutomationActionInterface {
  id = "WAIT";
  name = "Wait X Seconds";
  description = "Pauses the automation for a specified number of seconds.";

  async execute(context: AutomationContext, config: any): Promise<void> {
    const seconds = parseInt(config?.seconds || "10", 10);
    await context.log(`Waiting for ${seconds} seconds...`);
    await new Promise(r => setTimeout(r, seconds * 1000));
  }
}
