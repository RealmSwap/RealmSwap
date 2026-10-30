import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import CreateServerView from "@/components/CreateServerView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deploy a Server",
};

export default async function NewServerPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <CreateServerView user={user} />;
}
