import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import BackupsView from "@/components/BackupsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "World Backups",
};

export default async function BackupsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <BackupsView user={user} />;
}
