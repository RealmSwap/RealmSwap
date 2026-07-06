import { HostingProvider, CloudProviderPlan } from "../types";

export class HetznerProvider implements HostingProvider {
  id = "hetzner";
  name = "Hetzner Cloud";
  logo = "https://www.hetzner.com/assets/components/hetzner/images/hetzner-logo.svg"; // Fallback to text if missing
  rating = { performance: 5, easeOfMigration: 3, value: 5 };
  badges = ["Best Value", "Dedicated CPU"];

  async getPlans(): Promise<CloudProviderPlan[]> {
    return [
      { id: "cax11", name: "CAX11 (ARM)", monthlyCost: 4.5, cpuCores: 2, ramGB: 4, storageGB: 40, storageType: "NVMe SSD" },
      { id: "cpx31", name: "CPX31 (Intel)", monthlyCost: 15.5, cpuCores: 4, ramGB: 8, storageGB: 160, storageType: "NVMe SSD" },
      { id: "cpx41", name: "CPX41 (Intel)", monthlyCost: 29.5, cpuCores: 8, ramGB: 16, storageGB: 240, storageType: "NVMe SSD" },
    ];
  }

  async estimateCost(req: { ramGB: number; cpuCores: number }) {
    const plans = await this.getPlans();
    return plans.find(p => p.ramGB >= req.ramGB && Number(p.cpuCores) >= req.cpuCores) || plans[plans.length - 1];
  }

  async supportsGame(gameSlug: string, modCount: number) {
    // Hetzner is unmanaged, supports everything but requires manual setup for heavy mods
    return { supported: true, requiresManualConfig: modCount > 0 };
  }

  async getRegions() { return ["Europe", "North America"]; }

  async getLatencyEstimate(region: string) {
    if (region === "Europe") return 15;
    if (region === "North America") return 35;
    return 110;
  }

  async getFeatures() { return ["NVMe Storage", "Full Root Access", "DDoS Protection", "Instant Provisioning"]; }

  async migrateRealm(serverId: string, planId: string) {
    return { success: true, estimatedDowntimeMinutes: 12, instructions: "Hetzner requires manual OS setup. RealmSwap will attempt to provision a Debian 12 server via API." };
  }
}
