import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import ConsoleView from "@/components/ConsoleView";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Server Console",
};

export default async function ConsolePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <Suspense fallback={null}>
      <ConsoleView user={user} />
    </Suspense>
  );
}
