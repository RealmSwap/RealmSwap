import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import NodesView from "@/components/NodesView";

export const dynamic = "force-dynamic";

export default async function NodesPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <NodesView user={user} />;
}
