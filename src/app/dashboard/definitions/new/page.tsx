import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import DefinitionEditor from "@/components/DefinitionEditor";

export default async function NewDefinitionPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return <DefinitionEditor isAdmin={user.role === "ADMIN"} />;
}
