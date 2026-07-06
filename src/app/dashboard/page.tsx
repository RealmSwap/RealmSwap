import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DashboardView from "@/components/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { link?: string } }) {
  const user = await getAuthenticatedUser();

  if (!user) {
    let dest = "/login";
    if (searchParams?.link) {
      dest += `?link=${encodeURIComponent(searchParams.link)}`;
    }
    redirect(dest);
  }

  if (searchParams?.link) {
    redirect(`/dashboard/sync?link=${encodeURIComponent(searchParams.link)}`);
  }

  // Pre-fetch initial data directly from Prisma on the server
  const [servers, archives, logs] = await Promise.all([
    prisma.server.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.archive.findMany({
      where: { userId: user.id },
      orderBy: { archivedAt: "desc" },
    }),
    prisma.activityLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  const activeSlotsTotal = user.subscription?.activeSlots || 1;
  const activeSlotsUsed = servers.length;

  const initialData = {
    user,
    servers,
    archives,
    activityLogs: logs,
    slots: {
      used: activeSlotsUsed,
      total: activeSlotsTotal,
      remaining: activeSlotsTotal - activeSlotsUsed,
    }
  };

  return <DashboardView initialData={initialData} />;
}
