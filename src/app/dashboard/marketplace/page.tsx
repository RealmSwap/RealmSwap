import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import MarketplaceView from "@/components/MarketplaceView";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketplace",
};

export default async function MarketplacePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<div>Loading Marketplace...</div>}>
      <MarketplaceView user={user} />
    </Suspense>
  );
}
