import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SchedulesView from "@/components/SchedulesView";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  // Pre-fetch all user servers to select targets from
  const servers = await prisma.server.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  });

  return <SchedulesView servers={servers} user={user} />;
}
