import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import DefinitionEditor from "@/components/DefinitionEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Custom Game",
};

export default async function NewDefinitionPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return <DefinitionEditor isAdmin={user.role === "ADMIN"} />;
}
