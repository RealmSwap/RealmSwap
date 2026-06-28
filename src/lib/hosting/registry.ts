import { HostingProvider } from "./types";
import { aklizProvider } from "./aklizProvider";

const PROVIDERS: Record<string, HostingProvider> = {
  [aklizProvider.id]: aklizProvider,
};

export function getProvider(id: string): HostingProvider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown hosting provider: ${id}`);
  return p;
}

export function listProviders(): HostingProvider[] {
  return Object.values(PROVIDERS);
}
