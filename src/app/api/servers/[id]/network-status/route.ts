import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import { parseSpec } from "@/lib/definitions/serialize";
import { runConnectivityChecks } from "@/lib/connectivityCheck";
import { isTunnelAlive } from "@/lib/tunnels";

// GET: network truth for the HealthSidebar's Network row, for any server
// member (the full connectivity route is ADMIN-only because it returns the
// server password — this one returns the verdict and the first issue, no
// credentials, no addresses).
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await verifyServerAccess(params.id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Server not found or insufficient permissions" }, { status: 403 });
    }

    const { server } = access;
    const def = server.definitionId
      ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
      : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
    if (!def) {
      return NextResponse.json({ available: false });
    }

    const tunnelAlive = isTunnelAlive(server.id);
    const report = await runConnectivityChecks(server, parseSpec(def.spec), { tunnelAlive: isTunnelAlive });

    // The firewall check is advisory-only (it's always "warn" on Windows) —
    // surface the first real problem instead.
    const issue =
      report.checks.find((c) => c.status === "fail") ??
      report.checks.find((c) => c.status === "warn" && c.id !== "firewall") ??
      null;

    return NextResponse.json({
      available: true,
      overall: report.overall,
      issue: issue ? { label: issue.label, detail: issue.detail } : null,
      tunnelAlive,
    });
  } catch (error: any) {
    console.error("GET /api/servers/[id]/network-status error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
