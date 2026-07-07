export interface CloudProviderPlan {
  id: string;
  name: string;
  monthlyCost: number;
  cpuCores: number | string;
  ramGB: number;
  storageGB: number;
  storageType: string;
}

export interface HostingProvider {
  id: string;
  name: string;
  logo: string;
  rating: {
    performance: number; // out of 5
    easeOfMigration: number; // out of 5
    value: number; // out of 5
  };
  badges: string[]; // e.g. ["Best Value", "Easiest Setup"]
  
  getPlans(): Promise<CloudProviderPlan[]>;
  estimateCost(requirements: { ramGB: number; cpuCores: number }): Promise<CloudProviderPlan | null>;
  supportsGame(gameSlug: string, modCount: number): Promise<{ supported: boolean; requiresManualConfig: boolean }>;
  getRegions(): Promise<string[]>; // e.g. ["North America", "Europe"]
  getLatencyEstimate(userRegion: string): Promise<number>; // ms
  getFeatures(): Promise<string[]>; // e.g. ["Automatic Backups", "DDoS Protection"]
  migrateRealm(serverId: string, planId: string): Promise<{ success: boolean; estimatedDowntimeMinutes: number; instructions?: string }>;
}
