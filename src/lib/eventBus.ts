import { EventEmitter } from "events";

const globalForBus = globalThis as unknown as {
  serverEventBus: EventEmitter | undefined;
};

if (!globalForBus.serverEventBus) {
  globalForBus.serverEventBus = new EventEmitter();
  // Optional: Increase max listeners if many users
  globalForBus.serverEventBus.setMaxListeners(100);
}

export const serverEventBus = globalForBus.serverEventBus;
