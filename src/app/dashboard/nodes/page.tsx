import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import NodesView from "@/components/NodesView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Remote Hosts",
};

export default async function NodesPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <NodesView user={user} />;
}
