import { prisma } from "../db";
import { HostingProvider } from "./types";
import { HetznerProvider } from "./providers/hetzner";
import { AklizProvider } from "./providers/akliz";
import { BisectProvider } from "./providers/bisect";
import { DigitalOceanProvider } from "./providers/digitalocean";

const providers: HostingProvider[] = [
  new HetznerProvider(),
  new AklizProvider(),
  new BisectProvider(),
  new DigitalOceanProvider()
];

export interface AdvisorPreferences {
  priority: "Cheapest" | "Performance" | "Best Value" | "Lowest Latency" | "Simplest Setup" | "Best Mod Support";
  region: "North America" | "Europe" | "Asia" | "Australia" | "South America" | "Mixed";
  expectedUptime: "Weekends Only" | "Evenings" | "24/7" | "On Demand";
}

export async function analyzeServerReadiness(serverId: string) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { mods: true }
  });

  if (!server) throw new Error("Server not found");

  // Mock telemetry logic since we don't store historical data yet
  // In a production app, we would query ServerMetricSnapshot here
  const modCount = server.mods.length;
  const isModded = modCount > 0;
  
  // Estimate requirements based on game
  let requiredRamGB = 4;
  let requiredCpu = 2;
  
  if (server.game === "MINECRAFT") {
    requiredRamGB = isModded ? 8 : 4;
    requiredCpu = isModded ? 4 : 2;
  } else if (server.game === "VALHEIM") {
    requiredRamGB = 6;
  }

  // Generate readiness score
  // E.g. high RAM requirements + 24/7 = high readiness to move to cloud
  let readinessScore = 40;
  if (isModded) readinessScore += 20;
  if (requiredRamGB >= 8) readinessScore += 20;
  if (server.game === "ARK" || server.game === "RUST") readinessScore += 15;

  const reasoning = readinessScore > 70 
    ? "High resource usage and mod count indicates migrating to cloud will significantly improve stability."
    : "Current footprint is small enough that local hosting is still sufficient.";

  return {
    score: Math.min(readinessScore, 99),
    recommendation: readinessScore > 70 ? "MIGRATE" : "STAY_LOCAL",
    reasoning,
    metrics: {
      estimatedRamGB: requiredRamGB,
      estimatedCpuCores: requiredCpu,
      modCount,
    }
  };
}

export async function getRecommendations(serverId: string, preferences: AdvisorPreferences, metrics: { estimatedRamGB: number, estimatedCpuCores: number, modCount: number }) {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) throw new Error("Server not found");

  const results = await Promise.all(providers.map(async (provider) => {
    const plan = await provider.estimateCost({ ramGB: metrics.estimatedRamGB, cpuCores: metrics.estimatedCpuCores });
    const support = await provider.supportsGame(server.game, metrics.modCount);
    
    // Calculate a 'match score' based on preferences
    let matchScore = 0;
    
    if (preferences.priority === "Cheapest" && plan && plan.monthlyCost < 15) matchScore += 30;
    if (preferences.priority === "Performance" && provider.rating.performance === 5) matchScore += 30;
    if (preferences.priority === "Simplest Setup" && provider.rating.easeOfMigration === 5) matchScore += 30;
    if (preferences.priority === "Best Value" && provider.badges.includes("Best Value")) matchScore += 30;
    
    return {
      provider,
      plan,
      support,
      matchScore
    };
  }));

  // Sort by match score descending
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  // Return top 3
  return results.slice(0, 3).map(r => ({
    providerId: r.provider.id,
    name: r.provider.name,
    badges: r.provider.badges,
    rating: r.provider.rating,
    plan: r.plan,
    support: r.support,
    reasoning: r.matchScore > 20 
      ? `Matches your priority for ${preferences.priority}. Excellent ${server.game} support.`
      : "A solid alternative choice for this configuration."
  }));
}
