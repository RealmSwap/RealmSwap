import { HostingProvider, CloudProviderPlan } from "../types";

export class AklizProvider implements HostingProvider {
  id = "akliz";
  name = "Akliz";
  logo = "https://www.akliz.net/assets/images/logo.png";
  rating = { performance: 4, easeOfMigration: 5, value: 3 };
  badges = ["Easiest Setup", "Best Support"];

  async getPlans(): Promise<CloudProviderPlan[]> {
    return [
      { id: "basic", name: "Basic Plan", monthlyCost: 20, cpuCores: "Shared", ramGB: 4, storageGB: 50, storageType: "SSD" },
      { id: "premium", name: "Premium Plan", monthlyCost: 40, cpuCores: "Shared", ramGB: 8, storageGB: 100, storageType: "SSD" },
    ];
  }

  async estimateCost(req: { ramGB: number; cpuCores: number }) {
    const plans = await this.getPlans();
    return plans.find(p => p.ramGB >= req.ramGB) || plans[plans.length - 1];
  }

  async supportsGame(gameSlug: string, modCount: number) {
    if (gameSlug === "MINECRAFT" || gameSlug === "VALHEIM") return { supported: true, requiresManualConfig: false };
    return { supported: false, requiresManualConfig: true };
  }

  async getRegions() { return ["North America", "Europe"]; }
  async getLatencyEstimate(region: string) { return region === "North America" ? 25 : 85; }
  async getFeatures() { return ["Automated Backups", "1-Click Modpacks", "Managed Panel", "High Clock Speed CPUs"]; }

  async migrateRealm(serverId: string, planId: string) {
    return { success: true, estimatedDowntimeMinutes: 3, instructions: "Akliz migration is fully automated via FTP." };
  }
}
