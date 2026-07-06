import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HetznerProvider } from "@/lib/cloud-advisor/providers/hetzner";
import { AklizProvider } from "@/lib/cloud-advisor/providers/akliz";
import { BisectProvider } from "@/lib/cloud-advisor/providers/bisect";
import { DigitalOceanProvider } from "@/lib/cloud-advisor/providers/digitalocean";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { providerId, planId } = body;

    const server = await prisma.server.findUnique({ where: { id: params.id, userId: user.id } });
    if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    // Mock migration process
    let provider;
    switch(providerId) {
      case "hetzner": provider = new HetznerProvider(); break;
      case "akliz": provider = new AklizProvider(); break;
      case "bisect": provider = new BisectProvider(); break;
      case "digitalocean": provider = new DigitalOceanProvider(); break;
      default: return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const migrationResult = await provider.migrateRealm(params.id, planId);

    if (migrationResult.success) {
      // Simulate that the server is now running on the cloud host
      await prisma.server.update({
        where: { id: params.id },
        data: {
          runnerType: "REMOTE",
          region: "Cloud (Migrated)"
        }
      });
      
      // Log it
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "MIGRATE_SERVER",
          details: `Migrated server to ${provider.name}`
        }
      });
    }

    return NextResponse.json(migrationResult);
  } catch (err: any) {
    console.error("Advisor Migrate Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
