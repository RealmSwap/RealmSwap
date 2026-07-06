import { getAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsView } from "@/components/SettingsView";

export default async function SettingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return <SettingsView user={user} />;
}
