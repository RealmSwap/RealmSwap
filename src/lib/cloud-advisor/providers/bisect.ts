import { HostingProvider, CloudProviderPlan } from "../types";

export class BisectProvider implements HostingProvider {
  id = "bisect";
  name = "BisectHosting";
  logo = "";
  rating = { performance: 4, easeOfMigration: 5, value: 4 };
  badges = ["Recommended", "Great Mod Support"];

  async getPlans(): Promise<CloudProviderPlan[]> {
    return [
      { id: "budget_4", name: "Budget 4GB", monthlyCost: 11.96, cpuCores: "Shared", ramGB: 4, storageGB: 50, storageType: "NVMe SSD" },
      { id: "premium_8", name: "Premium 8GB", monthlyCost: 39.92, cpuCores: "Shared", ramGB: 8, storageGB: 100, storageType: "NVMe SSD" },
    ];
  }

  async estimateCost(req: { ramGB: number; cpuCores: number }) {
    const plans = await this.getPlans();
    return plans.find(p => p.ramGB >= req.ramGB) || plans[plans.length - 1];
  }

  async supportsGame(gameSlug: string, modCount: number) { return { supported: true, requiresManualConfig: false }; }
  async getRegions() { return ["North America", "Europe", "Asia", "Australia", "South America"]; }
  async getLatencyEstimate(region: string) { return 20; }
  async getFeatures() { return ["20+ Locations", "DDoS Protection", "Free Modpack Updates", "Daily Backups"]; }
  async migrateRealm(serverId: string, planId: string) {
    return { success: true, estimatedDowntimeMinutes: 5, instructions: "Fully automated transfer." };
  }
}
