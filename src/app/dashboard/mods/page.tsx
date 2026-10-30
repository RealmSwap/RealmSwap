import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import ModsView from "@/components/ModsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mods",
};

export default async function ModsPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <ModsView user={user} />;
}
