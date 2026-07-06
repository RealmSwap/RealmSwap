import { HostingProvider, CloudProviderPlan } from "../types";

export class DigitalOceanProvider implements HostingProvider {
  id = "digitalocean";
  name = "DigitalOcean";
  logo = "";
  rating = { performance: 4, easeOfMigration: 2, value: 4 };
  badges = ["Advanced Users", "Scalable"];

  async getPlans(): Promise<CloudProviderPlan[]> {
    return [
      { id: "s-2vcpu-4gb", name: "Basic 4GB", monthlyCost: 24, cpuCores: 2, ramGB: 4, storageGB: 80, storageType: "SSD" },
      { id: "s-4vcpu-8gb", name: "Basic 8GB", monthlyCost: 48, cpuCores: 4, ramGB: 8, storageGB: 160, storageType: "SSD" },
    ];
  }

  async estimateCost(req: { ramGB: number; cpuCores: number }) {
    const plans = await this.getPlans();
    return plans.find(p => p.ramGB >= req.ramGB) || plans[plans.length - 1];
  }

  async supportsGame(gameSlug: string, modCount: number) { return { supported: true, requiresManualConfig: true }; }
  async getRegions() { return ["North America", "Europe", "Asia", "Australia"]; }
  async getLatencyEstimate(region: string) { return 30; }
  async getFeatures() { return ["Scalable Droplets", "VPC Networking", "API Access", "Block Storage"]; }
  async migrateRealm(serverId: string, planId: string) {
    return { success: true, estimatedDowntimeMinutes: 15, instructions: "Requires OS provisioning." };
  }
}
