import { AutomationActionInterface } from "./types";
import { StartServerAction } from "./actions/StartServerAction";
import { StopServerAction } from "./actions/StopServerAction";
import { RestartServerAction } from "./actions/RestartServerAction";
import { WaitAction } from "./actions/WaitAction";
import { ConsoleCommandAction } from "./actions/ConsoleCommandAction";
import { DiscordAnnouncementAction } from "./actions/DiscordAnnouncementAction";

export class ActionRegistry {
  private static actions: Map<string, AutomationActionInterface> = new Map();

  static register(action: AutomationActionInterface) {
    this.actions.set(action.id, action);
  }

  static get(actionId: string): AutomationActionInterface | undefined {
    return this.actions.get(actionId);
  }

  static getAll(): AutomationActionInterface[] {
    return Array.from(this.actions.values());
  }
}

// Register built-in actions
ActionRegistry.register(new StartServerAction());
ActionRegistry.register(new StopServerAction());
ActionRegistry.register(new RestartServerAction());
ActionRegistry.register(new WaitAction());
ActionRegistry.register(new ConsoleCommandAction());
ActionRegistry.register(new DiscordAnnouncementAction());
