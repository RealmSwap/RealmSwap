import type { Metadata } from "next";
import { getAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsView } from "@/components/SettingsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return <SettingsView user={user} />;
}
