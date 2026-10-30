import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import AutomationsView from "@/components/AutomationsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Automation",
};

export default async function SchedulesPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <AutomationsView user={user} />;
}
