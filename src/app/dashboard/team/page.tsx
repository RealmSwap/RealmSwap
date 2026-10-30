import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import TeamView from "@/components/TeamView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <TeamView user={user} />;
}
