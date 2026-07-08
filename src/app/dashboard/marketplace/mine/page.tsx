import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import MyRealmsView from "@/components/MyRealmsView";

export const dynamic = "force-dynamic";

export default async function MyRealmsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  // One round-trip: the caller's realms + download analytics, scoped to
  // seller_id = auth.uid() inside the SECURITY DEFINER RPC.
  const supabase = createClient();
  const { data } = await supabase.rpc("get_my_realm_analytics", { p_days: 30 });

  return <MyRealmsView realms={Array.isArray(data) ? data : []} />;
}
