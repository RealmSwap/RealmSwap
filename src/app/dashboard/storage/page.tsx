import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import StorageView from "@/components/StorageView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Storage",
};

export default async function StoragePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }
  return <StorageView user={user} />;
}
