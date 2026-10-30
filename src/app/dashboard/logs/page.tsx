import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AuditLogsView from "@/components/AuditLogsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audit Logs",
};

export default async function LogsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all user activity logs
  const logs = await prisma.activityLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  });

  return <AuditLogsView initialLogs={logs} user={user} />;
}
